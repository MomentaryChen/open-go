import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { IngestionModule } from '../ingestion/ingestion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, IngestionModule],
  controllers: [AutomationController],
  providers: [AutomationService],
})
export class AutomationModule {}
