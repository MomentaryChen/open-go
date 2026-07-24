import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TripQueueService } from '../trip/trip-queue.service';
import { TripService } from '../trip/trip.service';

/** Statuses a job can sit in while still working; anything else is terminal. */
const ACTIVE_STATUSES = [
  'pending',
  'planning',
  'searching',
  'crawling',
  'composing',
];

export type JobListParams = {
  status?: string;
  keyword?: string;
  page: number;
  pageSize: number;
};

@Injectable()
export class AdminJobsService {
  private readonly logger = new Logger(AdminJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripService,
    private readonly queue: TripQueueService,
  ) {}

  async list({ status, keyword, page, pageSize }: JobListParams) {
    const where: Prisma.TripJobWhereInput = {};
    // "active" is a UI-level bucket covering every non-terminal status.
    if (status === 'active') where.status = { in: ACTIVE_STATUSES };
    else if (status) where.status = status;
    if (keyword) where.keyword = { contains: keyword, mode: 'insensitive' };

    const [total, rows] = await Promise.all([
      this.prisma.tripJob.count({ where }),
      this.prisma.tripJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { documents: true, queries: true } },
          itinerary: { select: { id: true, model: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: rows.map((job) => ({
        id: job.id,
        keyword: job.keyword,
        status: job.status,
        progress: job.progress,
        message: job.message,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        durationMs: job.updatedAt.getTime() - job.createdAt.getTime(),
        documentCount: job._count.documents,
        queryCount: job._count.queries,
        hasItinerary: Boolean(job.itinerary),
        model: job.itinerary?.model ?? null,
      })),
    };
  }

  async detail(jobId: string) {
    const job = await this.prisma.tripJob.findUnique({
      where: { id: jobId },
      include: {
        queries: true,
        itinerary: true,
        documents: {
          orderBy: [{ status: 'asc' }, { url: 'asc' }],
          // `content` is deliberately omitted: up to 12k chars per row would
          // dominate the payload and the admin list never renders it.
          select: {
            id: true,
            url: true,
            title: true,
            snippet: true,
            status: true,
            fetchedAt: true,
          },
        },
      },
    });
    if (!job) throw new NotFoundException(`Trip job ${jobId} not found`);

    const documentStats = job.documents.reduce<Record<string, number>>(
      (acc, doc) => {
        acc[doc.status] = (acc[doc.status] ?? 0) + 1;
        return acc;
      },
      {},
    );

    return {
      ...job,
      durationMs: job.updatedAt.getTime() - job.createdAt.getTime(),
      documentStats,
    };
  }

  /**
   * Re-runs the keyword as a brand-new job, bypassing the reuse cache so the
   * pipeline actually executes again. The original job is left untouched as a
   * record of the failure.
   */
  async retry(jobId: string) {
    const job = await this.prisma.tripJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Trip job ${jobId} not found`);

    const { job: created } = await this.trips.createJob(job.keyword, true);
    this.logger.log(`Retried job ${jobId} as ${created.id} ("${job.keyword}")`);
    return { jobId: created.id, keyword: created.keyword, status: created.status };
  }

  async remove(jobId: string) {
    const job = await this.prisma.tripJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Trip job ${jobId} not found`);
    await this.prisma.tripJob.delete({ where: { id: jobId } });
    return { ok: true };
  }

  /**
   * Jobs run in-process, so a backend restart strands them in a non-terminal
   * status forever. This marks the stale ones failed so they stop showing as
   * "in progress" and can be retried.
   */
  async failStuck(olderThanMinutes: number) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const result = await this.prisma.tripJob.updateMany({
      where: { status: { in: ACTIVE_STATUSES }, updatedAt: { lt: cutoff } },
      data: {
        status: 'failed',
        error: `任務逾時（超過 ${olderThanMinutes} 分鐘無進度），已由管理後台標記為失敗`,
        message: '任務逾時',
      },
    });
    return { updated: result.count, olderThanMinutes };
  }

  async stats(stuckAfterMinutes: number) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stuckCutoff = new Date(Date.now() - stuckAfterMinutes * 60 * 1000);

    const [byStatus, last24h, stuck, durations] = await Promise.all([
      this.prisma.tripJob.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.tripJob.groupBy({
        by: ['status'],
        where: { createdAt: { gte: dayAgo } },
        _count: { _all: true },
      }),
      this.prisma.tripJob.count({
        where: {
          status: { in: ACTIVE_STATUSES },
          updatedAt: { lt: stuckCutoff },
        },
      }),
      this.prisma.$queryRaw<Array<{ avg_ms: number | null; p95_ms: number | null }>>`
        SELECT
          AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) * 1000)::float AS avg_ms,
          PERCENTILE_CONT(0.95) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) * 1000
          )::float AS p95_ms
        FROM "TripJob"
        WHERE status = 'done' AND "createdAt" >= ${dayAgo}
      `,
    ]);

    const tally = (rows: Array<{ status: string; _count: { _all: number } }>) =>
      rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      }, {});

    const all = tally(byStatus);
    const recent = tally(last24h);
    const recentDone = recent.done ?? 0;
    const recentFailed = recent.failed ?? 0;
    const recentFinished = recentDone + recentFailed;

    return {
      total: Object.values(all).reduce((sum, count) => sum + count, 0),
      byStatus: all,
      active: ACTIVE_STATUSES.reduce((sum, key) => sum + (all[key] ?? 0), 0),
      stuck,
      stuckAfterMinutes,
      // In-process view: what is actually executing right now vs. waiting for
      // a slot. Differs from the DB status counts, which include jobs stranded
      // by an earlier restart.
      queue: this.queue.stats(),
      last24h: {
        total: Object.values(recent).reduce((sum, count) => sum + count, 0),
        done: recentDone,
        failed: recentFailed,
        successRate: recentFinished ? recentDone / recentFinished : null,
        avgDurationMs: durations[0]?.avg_ms ?? null,
        p95DurationMs: durations[0]?.p95_ms ?? null,
      },
    };
  }
}
