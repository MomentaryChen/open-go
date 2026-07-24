import { Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { BrowserFetcherService } from '../trip/browser-fetcher.service';
import {
  defaultModelFor,
  parseLlmProvider,
  tripConfig,
} from '../trip/trip.config';
import { GoogleSearchProvider } from '../trip/search/google-search.provider';
import { TripQueueService } from '../trip/trip-queue.service';

import { rollupHealthStatus, type HealthStatus } from './health-status';

export type { HealthStatus };

type CheckResult = {
  status: HealthStatus;
  detail?: string;
};

/** How long a Chromium probe result stays valid (launch is expensive). */
const CHROMIUM_PROBE_TTL_MS = 60_000;

/** Warn when finished jobs in the window succeed less often than this. */
const SUCCESS_RATE_WARN_THRESHOLD = 0.5;

/** Need at least this many finished jobs before success rate can warn. */
const SUCCESS_RATE_MIN_FINISHED = 3;

/**
 * One-glance ops snapshot for the admin health panel: database, Playwright
 * browsers, LLM API keys, live queue depth, and recent job success rate.
 */
@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger(AdminHealthService.name);

  private chromiumProbe?: {
    expiresAt: number;
    result: { available: boolean; version: string | null; detail?: string };
  };
  /** Coalesces overlapping probes so a refresh storm does not launch N Chromiums. */
  private chromiumProbing?: Promise<{
    available: boolean;
    version: string | null;
    detail?: string;
  }>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TripQueueService,
    private readonly settings: SettingsService,
    private readonly searchBrowser: GoogleSearchProvider,
    private readonly crawlBrowser: BrowserFetcherService,
  ) {}

  async check() {
    const [database, browsers, llm, last24h] = await Promise.all([
      this.checkDatabase(),
      this.checkBrowsers(),
      this.checkLlm(),
      this.checkLast24h(),
    ]);
    const queue = this.queue.stats();

    const status = rollupHealthStatus([
      database.status,
      browsers.status,
      llm.status,
      last24h.status,
    ]);

    return {
      status,
      checkedAt: new Date().toISOString(),
      database,
      browsers,
      llm,
      queue,
      last24h,
    };
  }

  private async checkDatabase(): Promise<
    CheckResult & { latencyMs: number }
  > {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - started };
    } catch (error) {
      const detail = (error as Error).message;
      this.logger.warn(`Database health check failed: ${detail}`);
      return { status: 'error', latencyMs: Date.now() - started, detail };
    }
  }

  private async checkBrowsers() {
    const search = this.searchBrowser.status();
    const crawlFallback = this.crawlBrowser.status();
    const chromiumProbe = await this.probeChromium();

    let status: HealthStatus = 'ok';
    let detail: string | undefined;

    if (search.enabled && !chromiumProbe.available) {
      status = 'error';
      detail =
        chromiumProbe.detail ??
        'Search browser is enabled but Chromium is not available';
    } else if (crawlFallback.enabled && !chromiumProbe.available) {
      status = 'warn';
      detail =
        chromiumProbe.detail ??
        'Crawl browser fallback is enabled but Chromium is not available';
    } else if (!search.enabled && !crawlFallback.enabled) {
      status = 'warn';
      detail = 'Both search and crawl browser fallbacks are disabled';
    }

    return {
      status,
      detail,
      search,
      crawlFallback,
      chromium: chromiumProbe,
    };
  }

  private async checkLlm() {
    const keys = {
      gemini: Boolean(
        process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
      ),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    };

    try {
      const requested = await this.settings.getString(
        'trip.llmProvider',
        tripConfig.llmProvider,
      );
      const provider =
        parseLlmProvider(requested) ?? tripConfig.llmProvider;
      const rawModel = await this.settings.getString('trip.llmModel', 'auto');
      const model =
        rawModel.toLowerCase() === 'auto'
          ? defaultModelFor(provider)
          : rawModel;

      const activeKeyConfigured =
        provider === 'anthropic' ? keys.anthropic : keys.gemini;

      // Only the active provider's key affects status. Missing keys for the
      // idle provider are shown in the UI but must not warn — most deploys
      // configure a single provider.
      if (!activeKeyConfigured) {
        return {
          status: 'error' as const,
          detail: `Active provider "${provider}" has no API key configured`,
          activeProvider: provider,
          activeModel: model,
          keys,
        };
      }

      return {
        status: 'ok' as const,
        activeProvider: provider,
        activeModel: model,
        keys,
      };
    } catch (error) {
      return {
        status: 'error' as const,
        detail: (error as Error).message,
        activeProvider: tripConfig.llmProvider,
        activeModel: tripConfig.model,
        keys,
      };
    }
  }

  private async checkLast24h() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const rows = await this.prisma.tripJob.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      });

      const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      }, {});

      const done = byStatus.done ?? 0;
      const failed = byStatus.failed ?? 0;
      const finished = done + failed;
      const successRate = finished ? done / finished : null;

      let status: HealthStatus = 'ok';
      let detail: string | undefined;

      if (
        successRate !== null &&
        finished >= SUCCESS_RATE_MIN_FINISHED &&
        successRate < SUCCESS_RATE_WARN_THRESHOLD
      ) {
        status = 'warn';
        detail = `Success rate ${(successRate * 100).toFixed(0)}% over ${finished} finished jobs`;
      }

      return {
        status,
        detail,
        total: Object.values(byStatus).reduce<number>((sum, n) => sum + n, 0),
        done,
        failed,
        successRate,
      };
    } catch (error) {
      // DB may already be reported down by checkDatabase; still return a
      // structured card instead of failing the whole /ops/health response.
      return {
        status: 'error' as const,
        detail: (error as Error).message,
        total: 0,
        done: 0,
        failed: 0,
        successRate: null,
      };
    }
  }

  private async probeChromium() {
    const now = Date.now();
    if (this.chromiumProbe && this.chromiumProbe.expiresAt > now) {
      return this.chromiumProbe.result;
    }
    if (this.chromiumProbing) return this.chromiumProbing;

    this.chromiumProbing = this.runChromiumProbe().finally(() => {
      this.chromiumProbing = undefined;
    });
    return this.chromiumProbing;
  }

  private async runChromiumProbe() {
    let result: {
      available: boolean;
      version: string | null;
      detail?: string;
    };

    try {
      const browser = await chromium.launch({
        headless: tripConfig.browserHeadless,
        channel: 'chromium',
        args: ['--no-sandbox'],
      });
      try {
        result = { available: true, version: browser.version() };
      } finally {
        await browser.close().catch(() => undefined);
      }
    } catch (error) {
      const detail = (error as Error).message;
      this.logger.warn(`Chromium probe failed: ${detail}`);
      result = { available: false, version: null, detail };
    }

    this.chromiumProbe = {
      expiresAt: Date.now() + CHROMIUM_PROBE_TTL_MS,
      result,
    };
    return result;
  }
}
