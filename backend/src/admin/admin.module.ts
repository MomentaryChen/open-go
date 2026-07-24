import { Module } from '@nestjs/common';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RetentionModule } from '../retention/retention.module';
import { SettingsModule } from '../settings/settings.module';
import { TripModule } from '../trip/trip.module';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminController } from './admin.controller';
import { AdminHealthService } from './admin-health.service';
import { AdminJobsService } from './admin-jobs.service';

/**
 * Read/operate surface for the admin console: job monitoring and keyword
 * analytics. Depends on TripModule only to re-run a job through the real
 * pipeline rather than duplicating its logic.
 */
@Module({
  imports: [
    PrismaModule,
    TripModule,
    RetentionModule,
    AffiliateModule,
    SettingsModule,
  ],
  controllers: [AdminController],
  providers: [AdminJobsService, AdminAnalyticsService, AdminHealthService],
})
export class AdminModule {}
