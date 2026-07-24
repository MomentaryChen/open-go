import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { AffiliateConfigService } from './affiliate-config.service';
import {
  AFFILIATE_CATEGORIES,
  AFFILIATE_EVENTS,
  AFFILIATE_PARTNERS,
  AffiliateService,
  type AffiliateCategory,
  type AffiliateEventName,
  type AffiliatePartner,
} from './affiliate.service';

type CreateAffiliateEventDto = {
  event?: string;
  jobId?: string;
  day?: number;
  category?: string;
  partner?: string;
  label?: string;
};

@Controller('affiliate')
export class AffiliateController {
  constructor(
    private readonly affiliate: AffiliateService,
    private readonly config: AffiliateConfigService,
  ) {}

  /**
   * Public affiliate ids, so the itinerary link builder can inject them into
   * outbound URLs. Values are non-secret (they appear in those URLs anyway).
   */
  @Get('config')
  getConfig() {
    return this.config.getConfig();
  }

  /** Public ingest for itinerary CTA funnel events (no admin key). */
  @Post('events')
  async create(@Body() body: CreateAffiliateEventDto) {
    const event = body?.event?.trim() as AffiliateEventName | undefined;
    const category = body?.category?.trim() as AffiliateCategory | undefined;
    const partner = body?.partner?.trim() as AffiliatePartner | undefined;

    if (!event || !AFFILIATE_EVENTS.includes(event)) {
      throw new BadRequestException(
        `event must be one of: ${AFFILIATE_EVENTS.join(', ')}`,
      );
    }
    if (!category || !AFFILIATE_CATEGORIES.includes(category)) {
      throw new BadRequestException(
        `category must be one of: ${AFFILIATE_CATEGORIES.join(', ')}`,
      );
    }
    if (!partner || !AFFILIATE_PARTNERS.includes(partner)) {
      throw new BadRequestException(
        `partner must be one of: ${AFFILIATE_PARTNERS.join(', ')}`,
      );
    }

    const row = await this.affiliate.record({
      event,
      jobId: body.jobId,
      day: body.day,
      category,
      partner,
      label: body.label,
    });
    return { id: row.id };
  }
}
