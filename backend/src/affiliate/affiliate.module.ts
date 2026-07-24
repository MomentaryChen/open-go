import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { AffiliateConfigService } from './affiliate-config.service';
import { AffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [AffiliateController],
  providers: [AffiliateService, AffiliateConfigService],
  exports: [AffiliateConfigService],
})
export class AffiliateModule {}
