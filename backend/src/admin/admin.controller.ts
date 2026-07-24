import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AffiliateConfigService } from '../affiliate/affiliate-config.service';
import type { AffiliateConfigInput } from '../affiliate/affiliate-config.service';
import { RetentionService } from '../retention/retention.service';
import { AdminGuard } from '../settings/admin.guard';
import {
  HostPolicyService,
  type HostOverrideAction,
} from '../trip/host-policy.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminHealthService } from './admin-health.service';
import { AdminJobsService } from './admin-jobs.service';
import type { JobCurationPatch } from './admin-jobs.service';

/** A job with no progress for this long is treated as stranded by a restart. */
const DEFAULT_STUCK_MINUTES = 30;

// Mounted at /ops rather than /admin so the frontend's /api/admin proxy maps to
// /api/admin/ops/* instead of a confusing /api/admin/admin/*.
@Controller('ops')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly jobs: AdminJobsService,
    private readonly analytics: AdminAnalyticsService,
    private readonly health: AdminHealthService,
    private readonly retention: RetentionService,
    private readonly affiliateConfig: AffiliateConfigService,
    private readonly hostPolicy: HostPolicyService,
  ) {}

  /**
   * One-glance system health: DB, Playwright browsers, LLM keys, queue depth,
   * and last-24h job success rate. First stop when jobs fail at scale.
   */
  @Get('health')
  systemHealth() {
    return this.health.check();
  }

  @Get('jobs')
  listJobs(
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.jobs.list({
      status: status?.trim() || undefined,
      keyword: keyword?.trim() || undefined,
      page: this.parseInt(page, 1, 1, 10_000),
      pageSize: this.parseInt(pageSize, 20, 1, 100),
    });
  }

  @Get('jobs/stats')
  jobStats(@Query('stuckAfterMinutes') stuckAfterMinutes?: string) {
    return this.jobs.stats(
      this.parseInt(stuckAfterMinutes, DEFAULT_STUCK_MINUTES, 1, 1440),
    );
  }

  /** Bulk-fails jobs stranded in a non-terminal status. */
  @Post('jobs/fail-stuck')
  failStuck(@Body() body?: { olderThanMinutes?: number }) {
    const minutes = body?.olderThanMinutes ?? DEFAULT_STUCK_MINUTES;
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      throw new BadRequestException(
        'olderThanMinutes must be between 1 and 1440',
      );
    }
    return this.jobs.failStuck(Math.floor(minutes));
  }

  /**
   * Retry every job matching the list filters (status and/or keyword).
   * Declared before `jobs/:id` so "batch-retry" is not parsed as an id.
   */
  @Post('jobs/batch-retry')
  batchRetry(
    @Body()
    body?: {
      status?: string;
      keyword?: string;
      limit?: number;
    },
  ) {
    return this.jobs.batchRetry({
      status: body?.status?.trim() || undefined,
      keyword: body?.keyword?.trim() || undefined,
      limit: this.clampOptionalLimit(body?.limit),
    });
  }

  /** Delete every job matching the list filters (status and/or keyword). */
  @Post('jobs/batch-delete')
  batchDelete(
    @Body()
    body?: {
      status?: string;
      keyword?: string;
      limit?: number;
    },
  ) {
    return this.jobs.batchDelete({
      status: body?.status?.trim() || undefined,
      keyword: body?.keyword?.trim() || undefined,
      limit: this.clampOptionalLimit(body?.limit),
    });
  }

  @Get('jobs/:id')
  jobDetail(@Param('id') id: string) {
    return this.jobs.detail(id);
  }

  @Post('jobs/:id/retry')
  retryJob(@Param('id') id: string) {
    return this.jobs.retry(id);
  }

  /** Stops a queued or running job; keeps its history for inspection / retry. */
  @Post('jobs/:id/cancel')
  cancelJob(@Param('id') id: string) {
    return this.jobs.cancel(id);
  }

  @Delete('jobs/:id')
  deleteJob(@Param('id') id: string) {
    return this.jobs.remove(id);
  }

  /** Sets explore-gallery curation flags (pin / hide / feature) on a job's itinerary. */
  @Patch('jobs/:id/curation')
  setJobCuration(@Param('id') id: string, @Body() body?: JobCurationPatch) {
    return this.jobs.setCuration(id, body ?? {});
  }

  @Get('analytics/keywords')
  keywords(@Query('days') days?: string, @Query('limit') limit?: string) {
    return this.analytics.keywords(
      this.parseInt(days, 30, 1, 365),
      this.parseInt(limit, 50, 1, 200),
    );
  }

  @Get('analytics/failure-reasons')
  failureReasons(@Query('days') days?: string, @Query('limit') limit?: string) {
    return this.analytics.failureReasons(
      this.parseInt(days, 30, 1, 365),
      this.parseInt(limit, 10, 1, 50),
    );
  }

  @Get('analytics/trend')
  trend(@Query('days') days?: string) {
    return this.analytics.trend(this.parseInt(days, 30, 1, 365));
  }

  @Get('analytics/content-gaps')
  contentGaps(
    @Query('days') days?: string,
    @Query('maxDocuments') maxDocuments?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.contentGaps(
      this.parseInt(days, 30, 1, 365),
      this.parseInt(maxDocuments, 5, 0, 100),
      this.parseInt(limit, 20, 1, 100),
    );
  }

  @Get('analytics/hosts')
  hosts(@Query('days') days?: string, @Query('limit') limit?: string) {
    return this.analytics.hosts(
      this.parseInt(days, 30, 1, 365),
      this.parseInt(limit, 30, 1, 200),
    );
  }

  @Get('analytics/llm-usage')
  llmUsage(@Query('days') days?: string) {
    return this.analytics.llmUsage(this.parseInt(days, 30, 1, 365));
  }

  /** Manual allow / deny lists used by crawl URL selection. */
  @Get('hosts/policy')
  getHostPolicy() {
    return this.hostPolicy.getLists();
  }

  /** Replace one or both host lists. Omitted fields are left unchanged. */
  @Put('hosts/policy')
  saveHostPolicy(
    @Body() body?: { allowlist?: string[]; denylist?: string[] },
  ) {
    return this.hostPolicy.saveLists(body ?? {});
  }

  /**
   * Set a single-host override: allow (whitelist), deny (blacklist), or clear.
   * Used by the keywords → source hosts table actions.
   */
  @Put('hosts/override')
  setHostOverride(@Body() body?: { host?: string; action?: string }) {
    const host = body?.host;
    const action = body?.action as HostOverrideAction | undefined;
    if (!host || typeof host !== 'string') {
      throw new BadRequestException('host is required');
    }
    if (action !== 'allow' && action !== 'deny' && action !== 'clear') {
      throw new BadRequestException('action must be allow, deny, or clear');
    }
    return this.hostPolicy.setOverride(host, action);
  }

  @Get('analytics/affiliate')
  affiliate(@Query('days') days?: string, @Query('limit') limit?: string) {
    return this.analytics.affiliate(
      this.parseInt(days, 30, 1, 365),
      this.parseInt(limit, 50, 1, 200),
    );
  }

  /** Current affiliate ids, for the admin config form to prefill. */
  @Get('affiliate/config')
  getAffiliateConfig() {
    return this.affiliateConfig.getConfig();
  }

  /** Save affiliate ids entered in the admin console. */
  @Put('affiliate/config')
  saveAffiliateConfig(@Body() body: AffiliateConfigInput) {
    return this.affiliateConfig.saveConfig(body ?? {});
  }

  /** Current storage footprint, and what a sweep would reclaim. */
  @Get('retention')
  async retentionStatus() {
    const [usage, preview] = await Promise.all([
      this.retention.usage(),
      this.retention.sweep(true),
    ]);
    return { usage, preview };
  }

  /** Runs the sweep now instead of waiting for the nightly cron. */
  @Post('retention/run')
  runRetention() {
    return this.retention.sweep(false);
  }

  private parseInt(
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(Math.max(Math.floor(value), min), max);
  }

  private clampOptionalLimit(raw: number | undefined): number | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (!Number.isFinite(raw)) return undefined;
    return Math.min(Math.max(Math.floor(raw), 1), 100);
  }
}
