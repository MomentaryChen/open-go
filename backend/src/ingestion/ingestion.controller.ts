import { Body, Controller, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service';

type CacheRequestBody = {
  source: string;
  endpoint: string;
  params: Record<string, string>;
};

type IngestPoisBody = {
  items: Array<{
    source: string;
    sourceId: string;
    regionName: string;
    countryCode?: string;
    name: string;
    category?: string;
    address?: string;
    rating?: number;
    reviewCount?: number;
    latitude?: number;
    longitude?: number;
  }>;
};

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('cache-check')
  cacheCheck(@Body() body: CacheRequestBody) {
    return this.ingestionService.cacheFetch(body.source, body.endpoint, body.params ?? {});
  }

  @Post('pois')
  ingestPois(@Body() body: IngestPoisBody) {
    return this.ingestionService.ingestPois(body.items ?? []);
  }
}
