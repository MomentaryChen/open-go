import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import { tripConfig } from './trip.config';

export type CrawlResult = {
  url: string;
  title?: string;
  content?: string;
  contentHash?: string;
  ok: boolean;
  error?: string;
};

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  /**
   * Fetches every url with bounded concurrency, invoking `onResult` as each
   * page settles so callers can stream progress. Never rejects on a single
   * page failure — a failed page comes back as `{ ok: false }`.
   */
  async crawlAll(
    urls: string[],
    onResult: (result: CrawlResult) => Promise<void> | void,
    opts?: { concurrency?: number },
  ) {
    const queue = [...urls];
    const workerCount = Math.max(
      1,
      Math.min(opts?.concurrency ?? tripConfig.crawlConcurrency, queue.length),
    );

    const worker = async () => {
      for (;;) {
        const url = queue.shift();
        if (!url) return;
        const result = await this.crawl(url);
        await onResult(result);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  async crawl(url: string): Promise<CrawlResult> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': tripConfig.userAgent,
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(tripConfig.fetchTimeoutMs),
      });

      if (!response.ok) {
        return { url, ok: false, error: `HTTP ${response.status}` };
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('html')) {
        return {
          url,
          ok: false,
          error: `unsupported content-type ${contentType}`,
        };
      }

      const html = await this.readCapped(response);
      const { title, content } = this.extract(html);

      if (!content || content.length < 200) {
        return { url, ok: false, error: 'no extractable body text' };
      }

      return {
        url,
        title,
        content,
        contentHash: createHash('sha256').update(content).digest('hex'),
        ok: true,
      };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.debug(`crawl failed ${url}: ${message}`);
      return { url, ok: false, error: message };
    }
  }

  private async readCapped(response: Response) {
    const buffer = await response.arrayBuffer();
    const capped =
      buffer.byteLength > tripConfig.maxResponseBytes
        ? buffer.slice(0, tripConfig.maxResponseBytes)
        : buffer;
    return new TextDecoder('utf-8').decode(capped);
  }

  private extract(html: string) {
    const $ = cheerio.load(html);
    const title =
      $('title').first().text().trim() || $('h1').first().text().trim();

    $(
      'script, style, noscript, nav, footer, aside, header, iframe, form',
    ).remove();

    const candidates = [
      'article',
      'main',
      '[role="main"]',
      '#content',
      '.post-content',
      'body',
    ];
    let text = '';
    for (const selector of candidates) {
      text = this.normalize($(selector).first().text());
      if (text.length >= 400) break;
    }

    return {
      title: title ? title.slice(0, 300) : undefined,
      content: text.slice(0, tripConfig.maxDocumentChars),
    };
  }

  private normalize(value: string) {
    return (
      value
        // Collapse every run of non-newline whitespace (incl. NBSP, ideographic
        // space) into a single space, then drop blank lines below.
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
        .trim()
    );
  }
}
