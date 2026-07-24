import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RetentionModule } from '../retention/retention.module';
import { TripModule } from '../trip/trip.module';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminController } from './admin.controller';
import { AdminJobsService } from './admin-jobs.service';

/**
 * Read/operate surface for the admin console: job monitoring and keyword
 * analytics. Depends on TripModule only to re-run a job through the real
 * pipeline rather than duplicating its logic.
 */
@Module({
  imports: [PrismaModule, TripModule, RetentionModule],
  controllers: [AdminController],
  providers: [AdminJobsService, AdminAnalyticsService],
})
export class AdminModule {}
