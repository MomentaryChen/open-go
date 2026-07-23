import { Module } from '@nestjs/common';
import { AutomationModule } from './automation/automation.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegionsModule } from './regions/regions.module';
import { SettingsModule } from './settings/settings.module';
import { TripModule } from './trip/trip.module';

@Module({
  imports: [
    PrismaModule,
    RegionsModule,
    IngestionModule,
    AutomationModule,
    SettingsModule,
    TripModule,
  ],
})
export class AppModule {}
