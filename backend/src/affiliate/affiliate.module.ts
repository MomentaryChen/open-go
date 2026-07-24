import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AffiliateController } from './affiliate.controller';
import { AffiliateService } from './affiliate.service';

@Module({
  imports: [PrismaModule],
  controllers: [AffiliateController],
  providers: [AffiliateService],
})
export class AffiliateModule {}
