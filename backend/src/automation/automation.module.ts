import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

// ScheduleModule.forRoot() lives in AppModule: more than one module now
// declares @Cron handlers, and they must not depend on this one being imported.
@Module({
  imports: [PrismaModule, IngestionModule],
  controllers: [AutomationController],
  providers: [AutomationService],
})
export class AutomationModule {}
