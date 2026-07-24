import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Nothing in the pipeline ever deleted anything, so every crawl was kept
 * forever: TripDocument.content alone is up to 12k characters per document and
 * ~30 documents per job. This trims the two things that actually grow without
 * bound — stored page text and finished jobs — plus the ingestion cache rows
 * that already carry an expiry nobody acted on.
 *
 * All three windows are admin-editable; setting one to 0 disables that sweep.
 */

/** Days before a finished job's crawled page text is dropped. */
const DEFAULT_CONTENT_RETENTION_DAYS = 30;
/** Days before a job and its queries/documents/itinerary are deleted outright. */
const DEFAULT_JOB_RETENTION_DAYS = 180;

export type RetentionResult = {
  contentStripped: number;
  jobsDeleted: number;
  cacheEntriesDeleted: number;
  contentRetentionDays: number;
  jobRetentionDays: number;
  dryRun: boolean;
};

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Daily at 03:17 — off the hour so it does not pile onto other schedules. */
  @Cron('0 17 3 * * *')
  async scheduledSweep() {
    const result = await this.sweep(false);
    this.logger.log(
      `Retention sweep: stripped ${result.contentStripped} document bodies, ` +
        `deleted ${result.jobsDeleted} jobs and ${result.cacheEntriesDeleted} cache entries`,
    );
  }

  /**
   * @param dryRun count what would be removed without touching anything, so the
   * admin console can preview a sweep before running it.
   */
  async sweep(dryRun: boolean): Promise<RetentionResult> {
    const contentRetentionDays = await this.settings.getNumber(
      'trip.contentRetentionDays',
      DEFAULT_CONTENT_RETENTION_DAYS,
    );
    const jobRetentionDays = await this.settings.getNumber(
      'trip.jobRetentionDays',
      DEFAULT_JOB_RETENTION_DAYS,
    );

    // Jobs go first: their documents cascade away, so stripping content
    // afterwards neither re-does deleted rows nor double-counts them in the
    // dry-run preview.
    const jobsDeleted = await this.deleteOldJobs(jobRetentionDays, dryRun);
    const contentStripped = await this.stripOldContent(
      contentRetentionDays,
      dryRun,
      // A preview cannot rely on the delete above having happened, so it
      // excludes the rows that pass would have removed.
      dryRun ? jobRetentionDays : 0,
    );
    const cacheEntriesDeleted = await this.purgeExpiredCache(dryRun);

    return {
      contentStripped,
      jobsDeleted,
      cacheEntriesDeleted,
      contentRetentionDays,
      jobRetentionDays,
      dryRun,
    };
  }

  /**
   * Clears crawled page text while keeping the document row: the url, title
   * and status stay queryable for the admin host/quality reports, and the
   * itinerary already cites its sources, so the body is dead weight.
   */
  private async stripOldContent(
    days: number,
    dryRun: boolean,
    excludeOlderThanDays: number,
  ): Promise<number> {
    if (days <= 0) return 0;
    const cutoff = this.daysAgo(days);

    const where = {
      content: { not: null },
      job: {
        status: { in: ['done', 'failed', 'cancelled'] },
        createdAt: excludeOlderThanDays
          ? { lt: cutoff, gte: this.daysAgo(excludeOlderThanDays) }
          : { lt: cutoff },
      },
    };

    if (dryRun) return this.prisma.tripDocument.count({ where });

    const result = await this.prisma.tripDocument.updateMany({
      where,
      data: { content: null },
    });
    return result.count;
  }

  /** Deletes whole jobs; queries, documents and itinerary cascade. */
  private async deleteOldJobs(days: number, dryRun: boolean): Promise<number> {
    if (days <= 0) return 0;
    const cutoff = this.daysAgo(days);

    const where = {
      status: { in: ['done', 'failed', 'cancelled'] },
      createdAt: { lt: cutoff },
    };

    if (dryRun) return this.prisma.tripJob.count({ where });

    const result = await this.prisma.tripJob.deleteMany({ where });
    return result.count;
  }

  /** These rows carry their own expiry; nothing had ever acted on it. */
  private async purgeExpiredCache(dryRun: boolean): Promise<number> {
    const where = { expiresAt: { lt: new Date() } };

    if (dryRun) return this.prisma.ingestionRequestCache.count({ where });

    const result = await this.prisma.ingestionRequestCache.deleteMany({ where });
    return result.count;
  }

  /** Current storage pressure, so the console can show what a sweep would reclaim. */
  async usage() {
    const [jobs, documents, documentsWithContent, cacheEntries, expiredCache] =
      await Promise.all([
        this.prisma.tripJob.count(),
        this.prisma.tripDocument.count(),
        this.prisma.tripDocument.count({ where: { content: { not: null } } }),
        this.prisma.ingestionRequestCache.count(),
        this.prisma.ingestionRequestCache.count({
          where: { expiresAt: { lt: new Date() } },
        }),
      ]);

    const contentBytes = await this.prisma.$queryRaw<
      Array<{ total: bigint | null }>
    >`SELECT SUM(LENGTH(content))::bigint AS total FROM "TripDocument" WHERE content IS NOT NULL`;

    return {
      jobs,
      documents,
      documentsWithContent,
      contentBytes: Number(contentBytes[0]?.total ?? 0),
      cacheEntries,
      expiredCache,
    };
  }

  private daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
