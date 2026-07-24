import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { RetentionService } from './retention.service';

@Module({
  imports: [PrismaModule, SettingsModule],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
