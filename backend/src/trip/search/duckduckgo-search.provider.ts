import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { tripConfig } from '../trip.config';
import { SearchHit, SearchProvider } from '../trip.types';

const AD_MARKERS = [
  'duckduckgo.com/y.js',
  'bing.com/aclick',
  'doubleclick.net',
];

/**
 * Fallback used when Google serves a JS-only shell, a CAPTCHA, or rate-limits
 * the scraper. `lite.duckduckgo.com` returns plain server-rendered markup.
 */
@Injectable()
export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = 'duckduckgo';
  private readonly logger = new Logger(DuckDuckGoSearchProvider.name);

  async search(query: string, limit: number): Promise<SearchHit[]> {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': tripConfig.userAgent,
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(tripConfig.fetchTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const $ = cheerio.load(await response.text());
    const hits: SearchHit[] = [];
    const seen = new Set<string>();

    $('a.result-link').each((_, element) => {
      if (hits.length >= limit) return false;

      const anchor = $(element);
      if (anchor.closest('tr').hasClass('result-sponsored')) return;

      const target = this.normalizeHref(anchor.attr('href'));
      if (!target || seen.has(target)) return;

      // The snippet lives in a later row of the same results table.
      const snippet = anchor
        .closest('tr')
        .nextAll('tr')
        .slice(0, 3)
        .find('td.result-snippet')
        .first()
        .text()
        .trim();

      seen.add(target);
      hits.push({
        url: target,
        title: anchor.text().trim().slice(0, 300),
        snippet: snippet ? snippet.slice(0, 500) : undefined,
      });
      return;
    });

    this.logger.debug(`duckduckgo "${query}" -> ${hits.length} hits`);
    return hits;
  }

  private normalizeHref(href?: string): string | undefined {
    if (!href) return undefined;

    // Results are wrapped as //duckduckgo.com/l/?uddg=<encoded target>
    let target = href;
    if (href.includes('/l/?')) {
      const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
      target = params.get('uddg') ?? '';
    } else if (href.startsWith('//')) {
      target = `https:${href}`;
    }

    if (!target.startsWith('http')) return undefined;
    if (AD_MARKERS.some((marker) => target.includes(marker))) return undefined;
    return target;
  }
}
