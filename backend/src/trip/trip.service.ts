import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { IngestionService } from '../ingestion/ingestion.service';
import type { IngestPoiInput } from '../ingestion/ingestion.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CrawlerService } from './crawler.service';
import { STRUCTURED_LLM } from './llm/llm.types';
import type { StructuredLlm } from './llm/llm.types';
import { ItineraryComposerService } from './itinerary-composer.service';
import type { Itinerary } from './itinerary-composer.service';
import { isHostBlocked, STATIC_BLOCKED_HOSTS } from './host-policy';
import { HostPolicyService } from './host-policy.service';
import { KeywordPlannerService, TripPlan } from './keyword-planner.service';
import { SearchService } from './search/search.service';
import { TripEventsService } from './trip-events.service';
import { TripQueueService } from './trip-queue.service';
import { tripConfig } from './trip.config';
import {
  EMPTY_PREFERENCES,
  hasAnyPreference,
  normalizePreferences,
  preferencesCacheKey,
  type TripPreferences,
} from './trip-preferences';
import {
  TripCancelledError,
  isTripCancelledError,
} from './trip-cancelled.error';
import { SearchHit, TripProgressEvent, TripStatus } from './trip.types';
import type { Prisma } from '@prisma/client';

/** Queued but never started — safe to run from the beginning after a restart. */
const RESUMABLE_STATUSES = ['pending'];
/** Caught mid-pipeline by a restart; cannot be continued. */
const IN_FLIGHT_STATUSES = ['planning', 'searching', 'crawling', 'composing'];
/** Non-terminal statuses a live job may hold; cancel/fail/publish only touch these. */
const ACTIVE_STATUSES = [...RESUMABLE_STATUSES, ...IN_FLIGHT_STATUSES];
/** A pending job older than this is abandoned rather than resumed on boot. */
const RESUME_WINDOW_MS = 60 * 60 * 1000;

/** Pipeline knobs resolved once per job: DB settings first, env/static fallback. */
type TripRuntimeConfig = {
  targetDocuments: number;
  crawlConcurrency: number;
  cacheTtlDays: number;
  resultsPerQuery: number;
  maxDocumentsPerHost: number;
};

/**
 * Reorder queries so languages alternate, round-robin across language buckets.
 * runSearch stops the moment `targetDocuments` is reached, so in the planner's
 * own order the queries it happens to list first fill every slot and the rest —
 * often an entire language — never run (observed: 4 English queries left at
 * resultCount 0 because 4 earlier Chinese ones already hit the quota). Bucketing
 * by primary subtag ("zh-TW" and "zh" share a bucket; empty/unknown tags share
 * one) and taking one query from each bucket per pass guarantees every language
 * contributes candidates before the quota closes the search.
 */
function interleaveByLanguage<T extends { language?: string | null }>(
  queries: T[],
): T[] {
  const buckets = new Map<string, T[]>();
  for (const query of queries) {
    const key = (query.language ?? '').toLowerCase().split('-')[0];
    const bucket = buckets.get(key);
    if (bucket) bucket.push(query);
    else buckets.set(key, [query]);
  }

  const groups = [...buckets.values()];
  if (groups.length <= 1) return queries;

  const maxLen = Math.max(...groups.map((group) => group.length));
  const interleaved: T[] = [];
  for (let round = 0; round < maxLen; round += 1) {
    for (const group of groups) {
      if (round < group.length) interleaved.push(group[round]);
    }
  }
  return interleaved;
}

@Injectable()
export class TripService implements OnModuleInit {
  private readonly logger = new Logger(TripService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: TripEventsService,
    private readonly queue: TripQueueService,
    private readonly planner: KeywordPlannerService,
    private readonly search: SearchService,
    private readonly crawler: CrawlerService,
    private readonly composer: ItineraryComposerService,
    private readonly ingestion: IngestionService,
    private readonly settings: SettingsService,
    private readonly hostPolicy: HostPolicyService,
    @Inject(STRUCTURED_LLM) private readonly llm: StructuredLlm,
  ) {}

  /**
   * Admin-editable settings take precedence over the env-derived tripConfig,
   * so changes apply to the next job without a restart. Resolved as one
   * snapshot so a mid-job settings edit can't produce inconsistent behavior.
   */
  private async resolveRuntimeConfig(): Promise<TripRuntimeConfig> {
    return {
      targetDocuments: await this.settings.getNumber(
        'trip.targetDocuments',
        tripConfig.targetDocuments,
      ),
      crawlConcurrency: await this.settings.getNumber(
        'trip.crawlConcurrency',
        tripConfig.crawlConcurrency,
      ),
      cacheTtlDays: await this.settings.getNumber(
        'trip.cacheTtlDays',
        tripConfig.cacheTtlDays,
      ),
      resultsPerQuery: await this.settings.getNumber(
        'trip.resultsPerQuery',
        tripConfig.resultsPerQuery,
      ),
      maxDocumentsPerHost: await this.settings.getNumber(
        'trip.maxDocumentsPerHost',
        tripConfig.maxDocumentsPerHost,
      ),
    };
  }

  async createJob(
    keyword: string,
    preferences: TripPreferences = EMPTY_PREFERENCES,
    forceRefresh = false,
  ) {
    if (!forceRefresh) {
      const cached = await this.findReusableJob(keyword, preferences);
      if (cached) {
        this.logger.log(
          `Cache hit: reusing job ${cached.id} for keyword "${keyword}"`,
        );
        return { job: cached, cached: true };
      }
    }

    const job = await this.prisma.tripJob.create({
      data: {
        keyword,
        // Store null for keyword-only jobs so legacy rows and no-preference
        // jobs are indistinguishable (both normalize to EMPTY_PREFERENCES).
        preferences: hasAnyPreference(preferences)
          ? (preferences as unknown as Prisma.InputJsonValue)
          : undefined,
        status: 'pending',
        progress: 0,
        message: '已排入佇列',
      },
    });

    this.events.emit({
      jobId: job.id,
      status: 'pending',
      progress: 0,
      message: '已排入佇列',
    });
    // Admission is the queue's call, not ours: it may start immediately or
    // hold the job until a slot frees.
    this.queue.enqueue(job.id, (signal) =>
      this.run(job.id, keyword, preferences, signal),
    );

    return { job, cached: false };
  }

  /**
   * Job state lives in this process, so a restart strands anything that was
   * in flight. Jobs that never started are re-queued; jobs caught mid-pipeline
   * cannot be resumed (their partial results are meaningless without the
   * in-memory context) and are failed explicitly rather than left to look
   * like they are still running forever.
   */
  async onModuleInit() {
    try {
      const orphaned = await this.prisma.tripJob.findMany({
        where: { status: { in: [...RESUMABLE_STATUSES, ...IN_FLIGHT_STATUSES] } },
        orderBy: { createdAt: 'asc' },
      });
      if (orphaned.length === 0) return;

      // Only jobs queued moments before the restart are worth resuming. After
      // a long outage nobody is still waiting on them, and running the backlog
      // would spend real LLM budget on results no one reads.
      const resumeCutoff = new Date(Date.now() - RESUME_WINDOW_MS);
      const resumable = orphaned.filter(
        (job) =>
          RESUMABLE_STATUSES.includes(job.status) &&
          job.createdAt >= resumeCutoff,
      );
      const abandoned = orphaned.filter(
        (job) => !resumable.some((candidate) => candidate.id === job.id),
      );

      if (abandoned.length > 0) {
        await this.prisma.tripJob.updateMany({
          where: { id: { in: abandoned.map((job) => job.id) } },
          data: {
            status: 'failed',
            error: '服務重新啟動，此任務已中斷，請重新執行',
            message: '任務已中斷',
          },
        });
      }

      for (const job of resumable) {
        const preferences = normalizePreferences(job.preferences);
        this.queue.enqueue(job.id, (signal) =>
          this.run(job.id, job.keyword, preferences, signal),
        );
      }

      this.logger.log(
        `Startup recovery: re-queued ${resumable.length} pending job(s), failed ${abandoned.length} interrupted/stale job(s)`,
      );
    } catch (error) {
      // Never block boot on recovery.
      this.logger.error('Startup job recovery failed', error as Error);
    }
  }

  /**
   * Latest finished job for the same keyword *and* the same preferences within
   * the cache TTL, if any. Keywords are compared whitespace- and
   * case-insensitively ("京都 五日 賞楓" matches "京都五日賞楓"); preferences
   * must match exactly (a different budget or extra must-visit place is a
   * different trip), so the match is done in JS over recent jobs rather than in
   * SQL.
   */
  private async findReusableJob(
    keyword: string,
    preferences: TripPreferences,
  ) {
    const cacheTtlDays = await this.settings.getNumber(
      'trip.cacheTtlDays',
      tripConfig.cacheTtlDays,
    );
    if (cacheTtlDays <= 0) return null;

    const since = new Date(Date.now() - cacheTtlDays * 24 * 60 * 60 * 1000);
    const target = this.keywordForms(keyword);
    const targetPrefs = preferencesCacheKey(preferences);
    const candidates = await this.prisma.tripJob.findMany({
      where: {
        status: 'done',
        createdAt: { gte: since },
        itinerary: { isNot: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return (
      candidates.find((job) => {
        const forms = this.keywordForms(job.keyword);
        const keywordMatches =
          forms.stripped === target.stripped ||
          forms.sorted === target.sorted;
        if (!keywordMatches) return false;
        return (
          preferencesCacheKey(normalizePreferences(job.preferences)) ===
          targetPrefs
        );
      }) ?? null
    );
  }

  /**
   * Two normal forms so spacing and word-order variants match:
   * - stripped: whitespace removed, original order ("京都五日賞楓")
   * - sorted: whitespace-delimited tokens sorted then joined, so
   *   "五日 京都 賞楓" and "京都 五日 賞楓" collapse to the same key
   */
  private keywordForms(keyword: string) {
    const lower = keyword.toLowerCase();
    return {
      stripped: lower.replace(/\s+/g, ''),
      sorted: lower.split(/\s+/).filter(Boolean).sort().join(''),
    };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.tripJob.findUnique({
      where: { id: jobId },
      include: {
        itinerary: true,
        queries: {
          select: {
            query: true,
            intent: true,
            language: true,
            resultCount: true,
          },
        },
        _count: { select: { documents: true } },
      },
    });

    if (!job) throw new NotFoundException(`Trip job ${jobId} not found`);
    return job;
  }

  /**
   * Public gallery of every finished itinerary, newest first, trimmed to the
   * fields a browse card needs. The region is the itinerary's `destination`
   * (the same value POIs are ingested under), so the frontend can group by it
   * without a separate taxonomy. The full itinerary JSON is read to pull those
   * few fields and then discarded — fine at this app's scale, and it keeps the
   * response small for the client.
   */
  async listGallery(limit = 200) {
    const jobs = await this.prisma.tripJob.findMany({
      where: { status: 'done', itinerary: { isNot: null } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        keyword: true,
        createdAt: true,
        itinerary: { select: { summary: true, data: true } },
        _count: { select: { documents: true } },
      },
    });

    return jobs.flatMap((job) => {
      const data = job.itinerary?.data as unknown as Partial<Itinerary> | null;
      if (!data || typeof data !== 'object') return [];
      const days = Array.isArray(data.days) ? data.days.length : 0;
      const destination =
        typeof data.destination === 'string' && data.destination.trim()
          ? data.destination.trim()
          : '其他';
      return [
        {
          jobId: job.id,
          keyword: job.keyword,
          createdAt: job.createdAt,
          destination,
          title: typeof data.title === 'string' ? data.title : job.keyword,
          durationDays:
            typeof data.durationDays === 'number' ? data.durationDays : days,
          dayCount: days,
          summary: job.itinerary?.summary ?? '',
          sourceCount: job._count.documents,
        },
      ];
    });
  }

  async listDocuments(jobId: string) {
    return this.prisma.tripDocument.findMany({
      where: { jobId },
      select: {
        id: true,
        url: true,
        title: true,
        snippet: true,
        status: true,
        fetchedAt: true,
      },
      orderBy: { url: 'asc' },
    });
  }

  private async run(
    jobId: string,
    keyword: string,
    preferences: TripPreferences = EMPTY_PREFERENCES,
    signal: AbortSignal = new AbortController().signal,
  ) {
    try {
      this.throwIfCancelled(signal);
      const cfg = await this.resolveRuntimeConfig();
      const plan = await this.runPlanning(jobId, keyword, preferences, signal);
      const urls = await this.runSearch(jobId, plan, cfg, signal);
      const fetched = await this.runCrawl(jobId, urls, cfg, signal);
      this.throwIfCancelled(signal);
      await this.runCompose(jobId, keyword, plan, fetched, preferences, signal);
    } catch (error) {
      if (isTripCancelledError(error) || signal.aborted) {
        await this.ensureCancelled(jobId);
        return;
      }
      const message = (error as Error).message;
      this.logger.error(`Trip job ${jobId} failed: ${message}`);
      // Conditional write: a concurrent cancel owns the terminal state.
      const updated = await this.prisma.tripJob.updateMany({
        where: { id: jobId, status: { in: ACTIVE_STATUSES } },
        data: { status: 'failed', error: message, message: '行程產生失敗' },
      });
      if (updated.count === 0) return;

      this.events.emit({
        jobId,
        status: 'failed',
        progress: 100,
        message: '行程產生失敗',
        error: message,
      });
    }
  }

  private throwIfCancelled(signal: AbortSignal) {
    if (signal.aborted) throw new TripCancelledError();
  }

  /**
   * Idempotent: admin cancel writes this first for a fast UI update; the
   * pipeline also calls it when the AbortSignal fires mid-stage.
   */
  private async ensureCancelled(jobId: string) {
    const current = await this.prisma.tripJob.findUnique({
      where: { id: jobId },
      select: { status: true, progress: true },
    });
    if (!current) return;
    if (
      current.status === 'cancelled' ||
      current.status === 'done' ||
      current.status === 'failed'
    ) {
      return;
    }

    await this.prisma.tripJob.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        error: 'Cancelled by admin',
        message: 'Cancelled',
      },
    });
    this.events.emit({
      jobId,
      status: 'cancelled',
      progress: current.progress,
      message: 'Cancelled',
      error: 'Cancelled by admin',
    });
  }

  private async runPlanning(
    jobId: string,
    keyword: string,
    preferences: TripPreferences,
    signal: AbortSignal,
  ) {
    this.throwIfCancelled(signal);
    await this.publish(jobId, 'planning', 5, '正在分解關鍵字…');

    const plan = await this.planner.plan(keyword, preferences);
    this.throwIfCancelled(signal);
    await this.prisma.tripQuery.createMany({
      data: plan.queries.map((query) => ({
        jobId,
        query: query.query,
        intent: query.intent,
        language: query.language,
      })),
    });

    await this.publish(
      jobId,
      'planning',
      12,
      `已產生 ${plan.queries.length} 組搜尋查詢`,
    );
    return plan;
  }

  private async runSearch(
    jobId: string,
    plan: TripPlan,
    cfg: TripRuntimeConfig,
    signal: AbortSignal,
  ) {
    this.throwIfCancelled(signal);
    await this.publish(jobId, 'searching', 15, '正在搜尋網路資料…');

    const collected = new Map<string, SearchHit>();
    const perHost = new Map<string, number>();
    const [unreliableHosts, policy] = await Promise.all([
      this.loadUnreliableHosts(),
      this.hostPolicy.getLists(),
    ]);
    const allowlist = new Set(policy.allowlist);
    const denylist = new Set(policy.denylist);
    let degraded = false;

    // Interleave by language so the early-exit at targetDocuments can't let one
    // language's queries claim every slot before another's ever run.
    const queries = interleaveByLanguage(plan.queries);
    for (const [index, query] of queries.entries()) {
      this.throwIfCancelled(signal);
      if (collected.size >= cfg.targetDocuments) break;
      if (index > 0) await this.search.throttle();

      let hits: SearchHit[] = [];
      try {
        const outcome = await this.search.search(
          query.query,
          cfg.resultsPerQuery,
        );
        hits = outcome.hits;
        degraded = degraded || outcome.degraded;
      } catch (error) {
        this.logger.warn(
          `Search failed for "${query.query}": ${(error as Error).message}`,
        );
      }

      for (const hit of hits) {
        if (collected.size >= cfg.targetDocuments) break;
        if (collected.has(hit.url)) continue;

        const host = this.hostOf(hit.url);
        if (!host) continue;
        if (
          isHostBlocked(host, {
            allowlist,
            denylist,
            unreliable: unreliableHosts,
            staticBlocked: STATIC_BLOCKED_HOSTS,
          })
        ) {
          continue;
        }
        const seenForHost = perHost.get(host) ?? 0;
        if (seenForHost >= cfg.maxDocumentsPerHost) continue;

        perHost.set(host, seenForHost + 1);
        collected.set(hit.url, hit);
      }

      await this.prisma.tripQuery.updateMany({
        where: { jobId, query: query.query },
        data: { resultCount: hits.length },
      });

      const progress =
        15 + Math.round((20 * (index + 1)) / queries.length);
      await this.publish(
        jobId,
        'searching',
        progress,
        `搜尋中：已找到 ${collected.size}/${cfg.targetDocuments} 篇${degraded ? '（Google 受限，已改用備援搜尋）' : ''}`,
      );
    }

    if (collected.size === 0) {
      throw new Error('搜尋沒有回傳任何可用連結，可能被搜尋引擎封鎖');
    }

    const hits = [...collected.values()];
    await this.prisma.tripDocument.createMany({
      data: hits.map((hit) => ({
        jobId,
        url: hit.url,
        title: hit.title ?? null,
        snippet: hit.snippet ?? null,
      })),
      skipDuplicates: true,
    });

    return hits.map((hit) => hit.url);
  }

  private async runCrawl(
    jobId: string,
    urls: string[],
    cfg: TripRuntimeConfig,
    signal: AbortSignal,
  ) {
    this.throwIfCancelled(signal);
    const reused = await this.reuseFetchedDocuments(jobId, urls, cfg);
    const pending = urls.filter((url) => !reused.has(url));

    await this.publish(
      jobId,
      'crawling',
      35,
      reused.size > 0
        ? `已重用 ${reused.size} 篇先前抓取的文章，準備抓取 ${pending.length} 篇…`
        : `準備抓取 ${urls.length} 篇文章…`,
    );

    let done = reused.size;
    let ok = reused.size;

    await this.crawler.crawlAll(pending, async (result) => {
      this.throwIfCancelled(signal);
      done += 1;
      if (result.ok) ok += 1;

      await this.prisma.tripDocument.update({
        where: { jobId_url: { jobId, url: result.url } },
        data: {
          title: result.title ?? undefined,
          content: result.content ?? null,
          contentHash: result.contentHash ?? null,
          status: result.ok ? 'fetched' : 'failed',
          // Keep a short reason on failure so admin job detail can explain thin
          // itineraries; clear on success so reused retries do not leave stale text.
          error: result.ok
            ? null
            : (result.error ?? 'crawl failed').slice(0, 500),
          fetchedAt: new Date(),
        },
      });

      const progress = 35 + Math.round((45 * done) / urls.length);
      this.events.emit({
        jobId,
        status: 'crawling',
        progress,
        message: `抓取中：${done}/${urls.length} 篇（成功 ${ok}）`,
        crawled: done,
        total: urls.length,
      });
    }, { concurrency: cfg.crawlConcurrency, signal });

    await this.publish(
      jobId,
      'crawling',
      80,
      reused.size > 0
        ? `已取得 ${ok}/${urls.length} 篇文章（含 ${reused.size} 篇重用）`
        : `已抓取 ${ok}/${urls.length} 篇文章`,
    );

    const fetched = await this.prisma.tripDocument.findMany({
      where: { jobId, status: 'fetched' },
      select: { url: true, title: true, content: true },
    });

    if (fetched.length === 0) {
      throw new Error('所有文章都抓取失敗，無法產生行程');
    }

    return fetched;
  }

  /**
   * Copy content that another job fetched for the same URL within the cache
   * TTL into this job's documents, so those URLs skip the crawler entirely.
   * Returns the set of reused URLs. `fetchedAt` keeps the original fetch time
   * so document age stays honest.
   */
  private async reuseFetchedDocuments(
    jobId: string,
    urls: string[],
    cfg: TripRuntimeConfig,
  ) {
    const reused = new Set<string>();
    if (cfg.cacheTtlDays <= 0 || urls.length === 0) return reused;

    const since = new Date(Date.now() - cfg.cacheTtlDays * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.tripDocument.findMany({
      where: {
        url: { in: urls },
        jobId: { not: jobId },
        status: 'fetched',
        content: { not: null },
        fetchedAt: { gte: since },
      },
      orderBy: { fetchedAt: 'desc' },
      select: {
        url: true,
        title: true,
        content: true,
        contentHash: true,
        fetchedAt: true,
      },
    });

    // Ordered newest-first, so the first row seen per URL is the freshest copy.
    for (const candidate of candidates) {
      if (reused.has(candidate.url)) continue;

      await this.prisma.tripDocument.update({
        where: { jobId_url: { jobId, url: candidate.url } },
        data: {
          title: candidate.title ?? undefined,
          content: candidate.content,
          contentHash: candidate.contentHash,
          status: 'fetched',
          error: null,
          fetchedAt: candidate.fetchedAt,
        },
      });
      reused.add(candidate.url);
    }

    if (reused.size > 0) {
      this.logger.log(
        `Job ${jobId}: reused ${reused.size}/${urls.length} documents from earlier jobs`,
      );
    }
    return reused;
  }

  private async runCompose(
    jobId: string,
    keyword: string,
    plan: TripPlan,
    documents: Array<{
      url: string;
      title: string | null;
      content: string | null;
    }>,
    preferences: TripPreferences,
    signal: AbortSignal,
  ) {
    this.throwIfCancelled(signal);
    await this.publish(
      jobId,
      'composing',
      85,
      `AI 正在整理 ${documents.length} 篇資料成行程…`,
    );

    // Resolved before composing: settings can change mid-compose, and the
    // record should name the model that actually produced the itinerary.
    const { model } = await this.llm.target();
    const itinerary = await this.composer.compose(
      keyword,
      plan,
      documents,
      preferences,
    );

    // Compose is the longest wait; cancel during it must not flip the row to done.
    this.throwIfCancelled(signal);

    await this.prisma.tripItinerary.create({
      data: {
        jobId,
        summary: itinerary.summary,
        data: itinerary,
        model,
      },
    });

    const updated = await this.prisma.tripJob.updateMany({
      where: { id: jobId, status: { in: ACTIVE_STATUSES } },
      data: { status: 'done', progress: 100, message: '行程已完成' },
    });
    if (updated.count === 0) {
      throw new TripCancelledError();
    }

    await this.ingestItineraryPois(jobId, plan, itinerary);

    this.events.emit({
      jobId,
      status: 'done',
      progress: 100,
      message: '行程已完成',
      itinerary,
    });
  }

  /**
   * Record every AI-recommended fixed place into the Poi catalog so the
   * knowledge base grows with each itinerary: name, category, address and
   * coordinates are kept, keyed by a deterministic (destination, name) id so
   * the same place recommended again updates rather than duplicates.
   * Best-effort — a failure here never fails the trip job.
   */
  private async ingestItineraryPois(
    jobId: string,
    plan: TripPlan,
    itinerary: Itinerary,
  ) {
    const regionName = itinerary.destination || plan.destination;
    const countryCode =
      /^[A-Za-z]{2}$/.test(plan.destinationCountryCode ?? '')
        ? plan.destinationCountryCode.toUpperCase()
        : undefined;

    const seen = new Set<string>();
    const pois: IngestPoiInput[] = [];
    for (const day of itinerary.days) {
      for (const item of day.items) {
        // Only fixed places make sense as POIs: transfers and misc. items
        // ("搭 JR 前往小樽") have no single location worth cataloguing.
        if (item.category === 'transport' || item.category === 'other') continue;
        if (item.latitude == null || item.longitude == null) continue;
        if (!item.name.trim()) continue;

        const sourceId = `${regionName}:${item.name}`
          .toLowerCase()
          .replace(/\s+/g, '');
        if (seen.has(sourceId)) continue;
        seen.add(sourceId);

        pois.push({
          source: 'ai-itinerary',
          sourceId,
          regionName,
          countryCode,
          name: item.name.trim(),
          category: item.category,
          address: item.address ?? undefined,
          latitude: item.latitude,
          longitude: item.longitude,
        });
      }
    }

    if (pois.length === 0) return;

    try {
      const result = await this.ingestion.ingestPois(pois);
      this.logger.log(
        `Job ${jobId}: ingested ${pois.length} itinerary POIs into region "${regionName}" (created ${result.created}, updated ${result.updated}, merged ${result.merged}, skipped ${result.skipped})`,
      );
    } catch (error) {
      this.logger.warn(
        `Job ${jobId}: failed to ingest itinerary POIs: ${(error as Error).message}`,
      );
    }
  }

  private async publish(
    jobId: string,
    status: TripStatus,
    progress: number,
    message: string,
  ) {
    // Conditional write so a concurrent cancel cannot be revived to an
    // in-progress status by a late publish.
    const updated = await this.prisma.tripJob.updateMany({
      where: { id: jobId, status: { in: ACTIVE_STATUSES } },
      data: { status, progress, message },
    });
    if (updated.count === 0) {
      throw new TripCancelledError();
    }

    const event: TripProgressEvent = { jobId, status, progress, message };
    this.events.emit(event);
  }

  /**
   * Hosts the crawler has tried at least 3 times in the last 30 days without a
   * single success — learned counterparts to STATIC_BLOCKED_HOSTS.
   */
  private async loadUnreliableHosts(): Promise<Set<string>> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ host: string }>>`
        SELECT regexp_replace(split_part(split_part(url, '//', 2), '/', 1), '^www\.', '') AS host
        FROM "TripDocument"
        WHERE "fetchedAt" >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        HAVING COUNT(*) >= 3
           AND COUNT(*) FILTER (WHERE status = 'fetched') = 0
      `;
      return new Set(rows.map((row) => row.host));
    } catch (error) {
      this.logger.warn(
        `Failed to load unreliable hosts, continuing without: ${(error as Error).message}`,
      );
      return new Set();
    }
  }

  private hostOf(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }
}
