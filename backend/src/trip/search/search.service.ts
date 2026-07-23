import { Injectable, Logger } from '@nestjs/common';
import { SearchHit } from '../trip.types';
import { DuckDuckGoSearchProvider } from './duckduckgo-search.provider';
import {
  GoogleSearchProvider,
  SearchBlockedError,
} from './google-search.provider';

export type SearchOutcome = {
  hits: SearchHit[];
  provider: string;
  degraded: boolean;
};

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  /** Once Google blocks us, stay on the fallback for the rest of the process. */
  private googleBlockedUntil = 0;

  constructor(
    private readonly google: GoogleSearchProvider,
    private readonly duckduckgo: DuckDuckGoSearchProvider,
  ) {}

  async search(query: string, limit: number): Promise<SearchOutcome> {
    if (Date.now() >= this.googleBlockedUntil) {
      try {
        const hits = await this.google.search(query, limit);
        return { hits, provider: this.google.name, degraded: false };
      } catch (error) {
        if (error instanceof SearchBlockedError) {
          // Back off Google for 10 minutes rather than hammering it per query.
          this.googleBlockedUntil = Date.now() + 10 * 60 * 1000;
        }
        this.logger.warn(
          `Google search failed for "${query}": ${(error as Error).message}`,
        );
      }
    }

    const hits = await this.duckduckgo.search(query, limit);
    return { hits, provider: this.duckduckgo.name, degraded: true };
  }

  /** Politeness delay between search queries so we are not an obvious scraper. */
  async throttle() {
    const delay = 1500 + Math.floor(Math.random() * 2000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
