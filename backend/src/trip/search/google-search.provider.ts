import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Browser, BrowserContext, chromium } from 'playwright';
import { tripConfig } from '../trip.config';
import { SearchHit, SearchProvider } from '../trip.types';

export class SearchBlockedError extends Error {}

const EXCLUDED_HOSTS = [
  'google.',
  'googleusercontent.com',
  'gstatic.com',
  'youtube.com/shorts',
  'accounts.',
  'policies.',
  'support.',
];

/**
 * Google no longer renders search results for plain HTTP clients — it returns a
 * JavaScript-only shell that redirects to `/httpservice/retry/enablejs`. Results
 * therefore have to be read from a real browser.
 *
 * Two details are load-bearing and were verified empirically; changing either one
 * makes Google serve its "unusual traffic" bot check instead of results:
 *   1. `channel: 'chromium'` — launches the full new-headless Chromium rather than
 *      the default headless shell, whose fingerprint Google rejects.
 *   2. the AutomationControlled flag + `navigator.webdriver` patch below.
 */
@Injectable()
export class GoogleSearchProvider implements SearchProvider, OnModuleDestroy {
  readonly name = 'google';
  private readonly logger = new Logger(GoogleSearchProvider.name);
  private browser?: Browser;
  private context?: BrowserContext;
  private starting?: Promise<BrowserContext>;

  /** Snapshot for the admin health panel — does not launch the browser. */
  status() {
    return {
      enabled: tripConfig.useBrowserSearch,
      launched: Boolean(this.browser?.isConnected()),
    };
  }

  async search(query: string, limit: number): Promise<SearchHit[]> {
    if (!tripConfig.useBrowserSearch) {
      throw new SearchBlockedError('Browser-based search is disabled');
    }

    const context = await this.ensureContext();
    const page = await context.newPage();

    try {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&hl=zh-TW&gl=tw`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Regional consent interstitial, when shown.
      const consent = page.locator(
        'button:has-text("全部接受"), button:has-text("Accept all")',
      );
      if (await consent.count()) {
        await consent
          .first()
          .click()
          .catch(() => undefined);
      }

      await page
        .waitForSelector('#search a h3, #rso a h3', { timeout: 12000 })
        .catch(() => undefined);

      const raw = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLAnchorElement>(
            '#search a:has(h3), #rso a:has(h3)',
          ),
        ].map((anchor) => ({
          url: anchor.href,
          title: anchor.querySelector('h3')?.textContent?.trim() ?? '',
          snippet:
            anchor
              .closest('[data-hveid]')
              ?.querySelector('.VwiC3b, [data-sncf]')
              ?.textContent?.trim() ?? '',
        })),
      );

      if (raw.length === 0) {
        const blocked = await page.evaluate(() => {
          const text = document.body.innerText;
          return text.includes('異常') || text.includes('unusual traffic');
        });
        throw new SearchBlockedError(
          blocked
            ? 'Google served its bot check'
            : 'Google returned no parsable results',
        );
      }

      const hits: SearchHit[] = [];
      const seen = new Set<string>();
      for (const item of raw) {
        if (hits.length >= limit) break;
        if (!item.title || seen.has(item.url) || !this.isUsable(item.url))
          continue;
        seen.add(item.url);
        hits.push({
          url: item.url,
          title: item.title.slice(0, 300),
          snippet: item.snippet ? item.snippet.slice(0, 500) : undefined,
        });
      }

      this.logger.debug(`google "${query}" -> ${hits.length} hits`);
      return hits;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy() {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }

  /** Launches the browser once and reuses it across queries and jobs. */
  private ensureContext(): Promise<BrowserContext> {
    if (this.context) return Promise.resolve(this.context);
    if (this.starting) return this.starting;

    this.starting = (async () => {
      this.browser = await chromium.launch({
        headless: tripConfig.browserHeadless,
        channel: 'chromium',
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      });

      const context = await this.browser.newContext({
        locale: 'zh-TW',
        timezoneId: 'Asia/Taipei',
        viewport: { width: 1366, height: 900 },
        userAgent: tripConfig.userAgent,
      });

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['zh-TW', 'zh', 'en'],
        });
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
      });

      this.context = context;
      this.logger.log('Search browser launched');
      return context;
    })();

    // A failed launch must not poison every later attempt.
    this.starting.catch(() => {
      this.starting = undefined;
    });

    return this.starting;
  }

  private isUsable(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        return false;
      const haystack = `${parsed.hostname}${parsed.pathname}`;
      return !EXCLUDED_HOSTS.some((blocked) => haystack.includes(blocked));
    } catch {
      return false;
    }
  }
}
