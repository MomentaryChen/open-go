import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { BrowserFetcherService } from './browser-fetcher.service';
import { CrawlerService } from './crawler.service';
import { LlmModule } from './llm/llm.module';
import { ItineraryComposerService } from './itinerary-composer.service';
import { KeywordPlannerService } from './keyword-planner.service';
import { DuckDuckGoSearchProvider } from './search/duckduckgo-search.provider';
import { GoogleSearchProvider } from './search/google-search.provider';
import { SearchService } from './search/search.service';
import { HostPolicyService } from './host-policy.service';
import { TripController } from './trip.controller';
import { TripEventsService } from './trip-events.service';
import { TripQueueService } from './trip-queue.service';
import { TripService } from './trip.service';

@Module({
  imports: [PrismaModule, LlmModule, SettingsModule, IngestionModule],
  controllers: [TripController],
  providers: [
    BrowserFetcherService,
    CrawlerService,
    DuckDuckGoSearchProvider,
    GoogleSearchProvider,
    HostPolicyService,
    ItineraryComposerService,
    KeywordPlannerService,
    SearchService,
    TripEventsService,
    TripQueueService,
    TripService,
  ],
  exports: [TripService, TripQueueService, HostPolicyService],
})
export class TripModule {}
