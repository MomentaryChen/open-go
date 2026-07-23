import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { CrawlerService } from './crawler.service';
import { LlmModule } from './llm/llm.module';
import { ItineraryComposerService } from './itinerary-composer.service';
import { KeywordPlannerService } from './keyword-planner.service';
import { DuckDuckGoSearchProvider } from './search/duckduckgo-search.provider';
import { GoogleSearchProvider } from './search/google-search.provider';
import { SearchService } from './search/search.service';
import { TripController } from './trip.controller';
import { TripEventsService } from './trip-events.service';
import { TripService } from './trip.service';

@Module({
  imports: [PrismaModule, LlmModule, SettingsModule],
  controllers: [TripController],
  providers: [
    CrawlerService,
    DuckDuckGoSearchProvider,
    GoogleSearchProvider,
    ItineraryComposerService,
    KeywordPlannerService,
    SearchService,
    TripEventsService,
    TripService,
  ],
})
export class TripModule {}
