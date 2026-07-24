import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const AFFILIATE_EVENTS = [
  'cta_impression',
  'cta_click',
  'outbound_redirect',
] as const;

export const AFFILIATE_CATEGORIES = ['lodging', 'ticket'] as const;

export const AFFILIATE_PARTNERS = [
  'booking',
  'trip',
  // 'agoda' retired: its search drops free-text queries. Kept in the allowlist
  // so any already-recorded agoda events are still accepted.
  'agoda',
  'google_hotels',
  'klook',
  'kkday',
] as const;

export type AffiliateEventName = (typeof AFFILIATE_EVENTS)[number];
export type AffiliateCategory = (typeof AFFILIATE_CATEGORIES)[number];
export type AffiliatePartner = (typeof AFFILIATE_PARTNERS)[number];

export type RecordAffiliateEventInput = {
  event: AffiliateEventName;
  jobId?: string | null;
  day?: number | null;
  category: AffiliateCategory;
  partner: AffiliatePartner;
  label?: string | null;
};

@Injectable()
export class AffiliateService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAffiliateEventInput) {
    let jobId: string | null = input.jobId?.trim() || null;
    if (jobId === 'unknown') jobId = null;

    // Drop dangling ids so the FK never rejects a valid funnel ping.
    if (jobId) {
      const exists = await this.prisma.tripJob.findUnique({
        where: { id: jobId },
        select: { id: true },
      });
      if (!exists) jobId = null;
    }

    const label = input.label?.trim().slice(0, 120) || null;
    const day =
      typeof input.day === 'number' &&
      Number.isFinite(input.day) &&
      input.day >= 1 &&
      input.day <= 60
        ? Math.floor(input.day)
        : null;

    return this.prisma.affiliateEvent.create({
      data: {
        event: input.event,
        jobId,
        day,
        category: input.category,
        partner: input.partner,
        label,
      },
      select: { id: true },
    });
  }
}
