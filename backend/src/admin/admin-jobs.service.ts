import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TripEventsService } from '../trip/trip-events.service';
import { TripQueueService } from '../trip/trip-queue.service';
import { TripService } from '../trip/trip.service';
import { normalizePreferences } from '../trip/trip-preferences';

/** Statuses a job can sit in while still working; anything else is terminal. */
const ACTIVE_STATUSES = [
  'pending',
  'planning',
  'searching',
  'crawling',
  'composing',
];

/** Cap for filter-matched batch retry/delete so a loose filter cannot flood the queue. */
const BATCH_MAX = 100;

export type JobListParams = {
  status?: string;
  keyword?: string;
  page: number;
  pageSize: number;
};

export type JobFilterParams = {
  status?: string;
  keyword?: string;
  /** Max rows to act on; clamped to BATCH_MAX. */
  limit?: number;
};

/** Explore-gallery curation flags; each is optional so a patch is partial. */
export type JobCurationPatch = {
  pinned?: boolean;
  hidden?: boolean;
  featured?: boolean;
};

@Injectable()
export class AdminJobsService {
  private readonly logger = new Logger(AdminJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trips: TripService,
    private readonly queue: TripQueueService,
    private readonly events: TripEventsService,
  ) {}

  private buildWhere(status?: string, keyword?: string): Prisma.TripJobWhereInput {
    const where: Prisma.TripJobWhereInput = {};
    // "active" is a UI-level bucket covering every non-terminal status.
    if (status === 'active') where.status = { in: ACTIVE_STATUSES };
    else if (status) where.status = status;
    if (keyword) where.keyword = { contains: keyword, mode: 'insensitive' };
    return where;
  }

  /**
   * Batch ops must target a deliberate filter — never "everything" — so a
   * misclick cannot wipe or re-queue the whole table.
   */
  private requireFilter(status?: string, keyword?: string) {
    if (!status && !keyword) {
      throw new BadRequestException(
        'Batch actions require a status and/or keyword filter',
      );
    }
  }

  async list({ status, keyword, page, pageSize }: JobListParams) {
    const where = this.buildWhere(status, keyword);

    const [total, rows] = await Promise.all([
      this.prisma.tripJob.count({ where }),
      this.prisma.tripJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { documents: true, queries: true } },
          itinerary: {
            select: {
              id: true,
              model: true,
              pinned: true,
              hidden: true,
              featured: true,
            },
          },
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
        // Only finished jobs have an itinerary, so `curation` is null for
        // everything not eligible for the gallery.
        curation: job.itinerary
          ? {
              pinned: job.itinerary.pinned,
              hidden: job.itinerary.hidden,
              featured: job.itinerary.featured,
            }
          : null,
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
            error: true,
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

    const { job: created } = await this.trips.createJob(
      job.keyword,
      normalizePreferences(job.preferences),
      true,
    );
    this.logger.log(`Retried job ${jobId} as ${created.id} ("${job.keyword}")`);
    return { jobId: created.id, keyword: created.keyword, status: created.status };
  }

  /**
   * Stops a queued or in-flight job without deleting its history. Queued jobs
   * are dropped from the backlog; running ones receive an AbortSignal and exit
   * at the next pipeline checkpoint. Stranded active rows (restart leftovers)
   * are still marked cancelled so they leave the "in progress" lists.
   */
  async cancel(jobId: string) {
    const job = await this.prisma.tripJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Trip job ${jobId} not found`);
    if (!ACTIVE_STATUSES.includes(job.status)) {
      throw new BadRequestException(
        `Job ${jobId} is already ${job.status} and cannot be cancelled`,
      );
    }

    const queueResult = this.queue.cancel(jobId);

    // Conditional update so a job that finishes between the read above and
    // this write cannot be rewritten from done/failed into cancelled.
    const updated = await this.prisma.tripJob.updateMany({
      where: { id: jobId, status: { in: ACTIVE_STATUSES } },
      data: {
        status: 'cancelled',
        error: 'Cancelled by admin',
        message: 'Cancelled',
      },
    });
    if (updated.count === 0) {
      throw new BadRequestException(
        `Job ${jobId} finished before it could be cancelled`,
      );
    }

    this.events.emit({
      jobId,
      status: 'cancelled',
      progress: job.progress,
      message: 'Cancelled',
      error: 'Cancelled by admin',
    });

    this.logger.log(
      `Cancelled job ${jobId} ("${job.keyword}"); queue=${queueResult}`,
    );
    return { ok: true, status: 'cancelled' as const, queue: queueResult };
  }

  async remove(jobId: string) {
    const job = await this.prisma.tripJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Trip job ${jobId} not found`);
    // Stop in-process work so a deleted job does not keep writing to missing rows.
    this.queue.cancel(jobId);
    await this.prisma.tripJob.delete({ where: { id: jobId } });
    return { ok: true };
  }

  /**
   * Sets the explore-gallery curation flags on a job's itinerary. Only finished
   * jobs have an itinerary, so a job that never produced one cannot be curated.
   * A partial patch is allowed — only the provided flags change.
   */
  async setCuration(jobId: string, patch: JobCurationPatch) {
    const data: Prisma.TripItineraryUpdateInput = {};
    for (const key of ['pinned', 'hidden', 'featured'] as const) {
      const value = patch[key];
      if (value === undefined) continue;
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`${key} must be a boolean`);
      }
      data[key] = value;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Provide at least one of pinned, hidden, featured',
      );
    }

    try {
      // Keyed by the unique jobId; P2025 means no itinerary row exists yet.
      const updated = await this.prisma.tripItinerary.update({
        where: { jobId },
        data,
        select: { pinned: true, hidden: true, featured: true },
      });
      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(
          `Trip job ${jobId} has no itinerary to curate`,
        );
      }
      throw error;
    }
  }

  /**
   * Re-runs every job matching the current list filters (capped). Useful after
   * an outage leaves a wave of failed jobs — filter to `failed` and retry once.
   */
  async batchRetry({ status, keyword, limit }: JobFilterParams) {
    this.requireFilter(status, keyword);
    const take = Math.min(Math.max(limit ?? BATCH_MAX, 1), BATCH_MAX);
    const where = this.buildWhere(status, keyword);
    const matched = await this.prisma.tripJob.count({ where });
    const rows = await this.prisma.tripJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, keyword: true, preferences: true },
    });

    const created: Array<{ sourceId: string; jobId: string; keyword: string }> =
      [];
    for (const row of rows) {
      const { job } = await this.trips.createJob(
        row.keyword,
        normalizePreferences(row.preferences),
        true,
      );
      created.push({
        sourceId: row.id,
        jobId: job.id,
        keyword: job.keyword,
      });
    }

    this.logger.log(
      `Batch-retried ${created.length}/${matched} jobs (status=${status ?? '*'} keyword=${keyword ?? '*'})`,
    );
    return {
      matched,
      retried: created.length,
      truncated: matched > created.length,
      limit: take,
      jobs: created,
    };
  }

  /** Deletes every job matching the current list filters (capped). */
  async batchDelete({ status, keyword, limit }: JobFilterParams) {
    this.requireFilter(status, keyword);
    const take = Math.min(Math.max(limit ?? BATCH_MAX, 1), BATCH_MAX);
    const where = this.buildWhere(status, keyword);
    const matched = await this.prisma.tripJob.count({ where });
    const rows = await this.prisma.tripJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return { matched, deleted: 0, truncated: false, limit: take };
    }

    const result = await this.prisma.tripJob.deleteMany({
      where: { id: { in: ids } },
    });
    this.logger.log(
      `Batch-deleted ${result.count}/${matched} jobs (status=${status ?? '*'} keyword=${keyword ?? '*'})`,
    );
    return {
      matched,
      deleted: result.count,
      truncated: matched > result.count,
      limit: take,
    };
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
