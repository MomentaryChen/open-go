import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IngestionService } from '../ingestion/ingestion.service';
import { PrismaService } from '../prisma/prisma.service';

type WikipediaSearchResponse = {
  query?: {
    search?: Array<{
      pageid: number;
      title: string;
      snippet: string;
    }>;
  };
};

type DiscoveryCategory = {
  key: string;
  searchKeyword: string;
  limit: number;
};

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  private readonly discoveryCategories: DiscoveryCategory[] = [
    { key: 'attraction', searchKeyword: 'tourist attractions', limit: 8 },
    { key: 'food', searchKeyword: 'best restaurants', limit: 6 },
    { key: 'shopping', searchKeyword: 'shopping places', limit: 5 },
    { key: 'cafe', searchKeyword: 'famous cafes', limit: 4 },
    { key: 'hotel', searchKeyword: 'popular hotels', limit: 4 },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionService: IngestionService,
  ) {}

  @Cron('0 */30 * * * *')
  async syncAttractionsFromWeb() {
    const regions = await this.prisma.region.findMany({
      where: {
        OR: [{ lastDiscoveryAt: null }, { lastDiscoveryAt: { lt: this.hoursAgo(12) } }],
      },
      orderBy: [{ lastDiscoveryAt: 'asc' }, { updatedAt: 'desc' }],
      take: 3,
    });

    for (const region of regions) {
      await this.discoverRegionNow(region.name, region.countryCode);
    }
  }

  @Cron('0 */45 * * * *')
  async syncReviewSourceLinks() {
    const pois = await this.prisma.poi.findMany({
      where: {
        OR: [{ updatedAt: { gt: this.hoursAgo(48) } }, { reviewLinks: { none: {} } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });

    for (const poi of pois) {
      const keyword = [poi.name, poi.address].filter(Boolean).join(' ');
      const links = this.buildReviewLinks(keyword);

      for (const link of links) {
        await this.prisma.poiReviewLink.upsert({
          where: {
            poiId_platform: {
              poiId: poi.id,
              platform: link.platform,
            },
          },
          create: {
            poiId: poi.id,
            platform: link.platform,
            url: link.url,
          },
          update: {
            url: link.url,
            generatedAt: new Date(),
          },
        });
      }
    }
  }

  async discoverRegionNow(query: string, countryCode?: string) {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) {
      return { status: 'skipped', reason: 'empty-query' };
    }

    const region = await this.prisma.region.upsert({
      where: {
        countryCode_name: {
          countryCode: countryCode ?? this.guessCountryCode(normalizedQuery),
          name: normalizedQuery,
        },
      },
      create: {
        countryCode: countryCode ?? this.guessCountryCode(normalizedQuery),
        name: normalizedQuery,
      },
      update: {},
    });

    const discoveredItems = await this.fetchDiscoveriesByCategories(normalizedQuery);
    const ingestResult = await this.ingestionService.ingestPois(
      discoveredItems.map((item) => ({
        source: 'wikimedia',
        sourceId: `${item.category}-${item.pageid}`,
        regionName: region.name,
        countryCode: region.countryCode,
        name: item.title,
        category: item.category,
        address: this.cleanSnippet(item.snippet),
      })),
    );

    await this.prisma.region.update({
      where: { id: region.id },
      data: { lastDiscoveryAt: new Date() },
    });

    this.logger.log(
      `Region ${region.name} discovered: created=${ingestResult.created}, updated=${ingestResult.updated}, skipped=${ingestResult.skipped}`,
    );

    return {
      status: 'ok',
      region: { id: region.id, name: region.name, countryCode: region.countryCode },
      discovered: discoveredItems.length,
      ingestion: ingestResult,
      categories: this.countByCategory(discoveredItems.map((item) => item.category)),
    };
  }

  private async fetchDiscoveriesByCategories(query: string) {
    const discovered = new Map<string, { pageid: number; title: string; snippet: string; category: string }>();

    for (const category of this.discoveryCategories) {
      const search = encodeURIComponent(`${query} ${category.searchKeyword}`);
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${category.limit}&srsearch=${search}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Wikipedia request failed with status ${response.status}`);
      }

      const data = (await response.json()) as WikipediaSearchResponse;
      const items = data.query?.search ?? [];

      for (const item of items) {
        const key = `${category.key}:${item.pageid}`;
        if (!discovered.has(key)) {
          discovered.set(key, {
            pageid: item.pageid,
            title: item.title,
            snippet: item.snippet,
            category: category.key,
          });
        }
      }
    }

    return Array.from(discovered.values());
  }

  private buildReviewLinks(keyword: string) {
    const encoded = encodeURIComponent(`${keyword} reviews`);
    return [
      { platform: 'google-maps', url: `https://www.google.com/maps/search/${encoded}` },
      { platform: 'tripadvisor', url: `https://www.tripadvisor.com/Search?q=${encoded}` },
      { platform: 'booking', url: `https://www.booking.com/searchresults.html?ss=${encoded}` },
    ];
  }

  private cleanSnippet(snippet: string) {
    return snippet.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  private guessCountryCode(query: string) {
    if (query.includes('日本') || query.toLowerCase().includes('japan')) return 'JP';
    if (query.includes('台灣') || query.includes('臺灣') || query.toLowerCase().includes('taiwan'))
      return 'TW';
    return 'UN';
  }

  private hoursAgo(hours: number) {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  private countByCategory(categories: string[]) {
    return categories.reduce<Record<string, number>>((acc, category) => {
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    }, {});
  }
}
