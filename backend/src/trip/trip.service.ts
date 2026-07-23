import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CrawlerService } from './crawler.service';
import { STRUCTURED_LLM } from './llm/llm.types';
import type { StructuredLlm } from './llm/llm.types';
import { ItineraryComposerService } from './itinerary-composer.service';
import { KeywordPlannerService, TripPlan } from './keyword-planner.service';
import { SearchService } from './search/search.service';
import { TripEventsService } from './trip-events.service';
import { tripConfig } from './trip.config';
import { SearchHit, TripProgressEvent, TripStatus } from './trip.types';

/**
 * Hosts that consistently reject the crawler (login walls, JS-only shells).
 * Confirmed by crawl history: facebook 0/7, youtube 0/5 fetched. Skipping them
 * at URL-selection time keeps all document slots for fetchable pages.
 */
const BLOCKED_HOSTS = [
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'threads.com',
  'threads.net',
  'x.com',
  'twitter.com',
  'reddit.com',
];

/** Pipeline knobs resolved once per job: DB settings first, env/static fallback. */
type TripRuntimeConfig = {
  targetDocuments: number;
  crawlConcurrency: number;
  cacheTtlDays: number;
  resultsPerQuery: number;
  maxDocumentsPerHost: number;
};

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: TripEventsService,
    private readonly planner: KeywordPlannerService,
    private readonly search: SearchService,
    private readonly crawler: CrawlerService,
    private readonly composer: ItineraryComposerService,
    private readonly settings: SettingsService,
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

  async createJob(keyword: string, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await this.findReusableJob(keyword);
      if (cached) {
        this.logger.log(
          `Cache hit: reusing job ${cached.id} for keyword "${keyword}"`,
        );
        return { job: cached, cached: true };
      }
    }

    const job = await this.prisma.tripJob.create({
      data: { keyword, status: 'pending', progress: 0, message: '已排入佇列' },
    });

    this.events.emit({
      jobId: job.id,
      status: 'pending',
      progress: 0,
      message: '已排入佇列',
    });
    void this.run(job.id, keyword).catch((error) => {
      this.logger.error(`Trip job ${job.id} crashed`, error as Error);
    });

    return { job, cached: false };
  }

  /**
   * Latest finished job for the same keyword within the cache TTL, if any.
   * Keywords are compared whitespace- and case-insensitively ("京都 五日 賞楓"
   * matches "京都五日賞楓"), so the match is done in JS over recent jobs
   * rather than in SQL.
   */
  private async findReusableJob(keyword: string) {
    const cacheTtlDays = await this.settings.getNumber(
      'trip.cacheTtlDays',
      tripConfig.cacheTtlDays,
    );
    if (cacheTtlDays <= 0) return null;

    const since = new Date(Date.now() - cacheTtlDays * 24 * 60 * 60 * 1000);
    const target = this.keywordForms(keyword);
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
        return (
          forms.stripped === target.stripped || forms.sorted === target.sorted
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

  private async run(jobId: string, keyword: string) {
    try {
      const cfg = await this.resolveRuntimeConfig();
      const plan = await this.runPlanning(jobId, keyword);
      const urls = await this.runSearch(jobId, plan, cfg);
      const fetched = await this.runCrawl(jobId, urls, cfg);
      await this.runCompose(jobId, keyword, plan, fetched);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Trip job ${jobId} failed: ${message}`);
      await this.prisma.tripJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: message, message: '行程產生失敗' },
      });
      this.events.emit({
        jobId,
        status: 'failed',
        progress: 100,
        message: '行程產生失敗',
        error: message,
      });
    }
  }

  private async runPlanning(jobId: string, keyword: string) {
    await this.publish(jobId, 'planning', 5, '正在分解關鍵字…');

    const plan = await this.planner.plan(keyword);
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
  ) {
    await this.publish(jobId, 'searching', 15, '正在搜尋網路資料…');

    const collected = new Map<string, SearchHit>();
    const perHost = new Map<string, number>();
    const unreliableHosts = await this.loadUnreliableHosts();
    let degraded = false;

    for (const [index, query] of plan.queries.entries()) {
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
        if (this.isBlockedHost(host, unreliableHosts)) continue;
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
        15 + Math.round((20 * (index + 1)) / plan.queries.length);
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
  ) {
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
      done += 1;
      if (result.ok) ok += 1;

      await this.prisma.tripDocument.update({
        where: { jobId_url: { jobId, url: result.url } },
        data: {
          title: result.title ?? undefined,
          content: result.content ?? null,
          contentHash: result.contentHash ?? null,
          status: result.ok ? 'fetched' : 'failed',
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
    }, { concurrency: cfg.crawlConcurrency });

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
  ) {
    await this.publish(
      jobId,
      'composing',
      85,
      `AI 正在整理 ${documents.length} 篇資料成行程…`,
    );

    // Resolved before composing: settings can change mid-compose, and the
    // record should name the model that actually produced the itinerary.
    const { model } = await this.llm.target();
    const itinerary = await this.composer.compose(keyword, plan, documents);

    await this.prisma.tripItinerary.create({
      data: {
        jobId,
        summary: itinerary.summary,
        data: itinerary,
        model,
      },
    });

    await this.prisma.tripJob.update({
      where: { id: jobId },
      data: { status: 'done', progress: 100, message: '行程已完成' },
    });

    this.events.emit({
      jobId,
      status: 'done',
      progress: 100,
      message: '行程已完成',
      itinerary,
    });
  }

  private async publish(
    jobId: string,
    status: TripStatus,
    progress: number,
    message: string,
  ) {
    await this.prisma.tripJob.update({
      where: { id: jobId },
      data: { status, progress, message },
    });

    const event: TripProgressEvent = { jobId, status, progress, message };
    this.events.emit(event);
  }

  /**
   * Hosts the crawler has tried at least 3 times in the last 30 days without a
   * single success — learned counterparts to the static BLOCKED_HOSTS list.
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

  private isBlockedHost(host: string, unreliable: Set<string>) {
    if (unreliable.has(host)) return true;
    return BLOCKED_HOSTS.some(
      (blocked) => host === blocked || host.endsWith(`.${blocked}`),
    );
  }

  private hostOf(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }
}
