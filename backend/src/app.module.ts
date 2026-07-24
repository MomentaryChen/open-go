import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { AffiliateModule } from './affiliate/affiliate.module';
import { AutomationModule } from './automation/automation.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegionsModule } from './regions/regions.module';
import { RetentionModule } from './retention/retention.module';
import { SettingsModule } from './settings/settings.module';
import { TripModule } from './trip/trip.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    RegionsModule,
    IngestionModule,
    AutomationModule,
    SettingsModule,
    TripModule,
    AffiliateModule,
    RetentionModule,
    AdminModule,
  ],
})
export class AppModule {}
