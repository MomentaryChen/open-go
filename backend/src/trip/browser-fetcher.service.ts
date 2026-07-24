import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Browser, BrowserContext, chromium } from 'playwright';
import { tripConfig } from './trip.config';

/**
 * Renders a page in a real headless browser so the crawler can recover URLs
 * that a plain `fetch` cannot: anti-bot 403s (the site blocks non-browser
 * clients) and JavaScript-rendered pages (the body is empty without JS). Used
 * only as a fallback — the crawler tries a cheap direct fetch first and comes
 * here just for the pages that fail.
 *
 * The launch mirrors GoogleSearchProvider's anti-detection setup (full Chromium
 * channel + navigator patches), which is what lets these requests pass where a
 * plain client is rejected. Kept separate from the search browser so the search
 * path — whose fingerprint details are load-bearing — is never disturbed.
 */
@Injectable()
export class BrowserFetcherService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserFetcherService.name);
  private browser?: Browser;
  private context?: BrowserContext;
  private starting?: Promise<BrowserContext>;

  isEnabled() {
    return tripConfig.crawlBrowserFallback;
  }

  /**
   * Fully rendered HTML of the page, or null when the fallback is disabled or
   * the navigation fails. Never throws — the caller treats null as a miss.
   */
  async fetch(url: string): Promise<string | null> {
    if (!tripConfig.crawlBrowserFallback) return null;

    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: tripConfig.browserFetchTimeoutMs,
      });
      // Client-rendered pages populate the DOM after domcontentloaded; give
      // them a brief window to settle, but never let one keep the crawl waiting.
      await page
        .waitForLoadState('networkidle', { timeout: 5000 })
        .catch(() => undefined);
      return await page.content();
    } catch (error) {
      this.logger.debug(
        `browser fetch failed ${url}: ${(error as Error).message}`,
      );
      return null;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy() {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }

  /** Launches the browser once and reuses it across pages and jobs. */
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

      // We only read text, so drop images/media/fonts: it cuts page weight and
      // load time sharply on exactly the media-heavy pages that need a browser.
      await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (type === 'image' || type === 'media' || type === 'font') {
          return route.abort();
        }
        return route.continue();
      });

      this.context = context;
      this.logger.log('Crawl fallback browser launched');
      return context;
    })();

    // A failed launch must not poison every later attempt.
    this.starting.catch(() => {
      this.starting = undefined;
    });

    return this.starting;
  }
}
