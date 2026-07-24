import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import {
  AFFILIATE_CONFIG_FIELDS,
  AffiliateConfig,
  emptyAffiliateConfig,
} from './affiliate-config';

/** Nested partial: only the fields the caller wants to change need be present. */
export type AffiliateConfigInput = {
  booking?: { aid?: string };
  trip?: { allianceid?: string; sid?: string };
  klook?: { aid?: string };
  kkday?: { cid?: string };
};

// Affiliate ids are URL-unreserved tokens (mostly numeric); reject anything
// that could break the query string or smuggle in extra params.
const ID_PATTERN = /^[A-Za-z0-9._~-]*$/;
const MAX_ID_LENGTH = 200;

@Injectable()
export class AffiliateConfigService {
  constructor(private readonly settings: SettingsService) {}

  /** Current ids, blank where unset. Backs both the public link builder and the admin form. */
  async getConfig(): Promise<AffiliateConfig> {
    const config = emptyAffiliateConfig();
    await Promise.all(
      AFFILIATE_CONFIG_FIELDS.map(async (field) => {
        field.set(config, await this.settings.getString(field.key, ''));
      }),
    );
    return config;
  }

  /**
   * Persist the provided ids and return the full up-to-date config. Fields left
   * out of the input are untouched; an explicit empty string clears one.
   */
  async saveConfig(input: AffiliateConfigInput): Promise<AffiliateConfig> {
    const incoming = this.flatten(input);
    for (const field of AFFILIATE_CONFIG_FIELDS) {
      const raw = incoming[field.key];
      if (raw === undefined) continue;
      const value = this.clean(raw, field.key);
      await this.settings.setString(field.key, value, field.description);
    }
    return this.getConfig();
  }

  private flatten(input: AffiliateConfigInput): Record<string, string | undefined> {
    return {
      'affiliate.booking.aid': input.booking?.aid,
      'affiliate.trip.allianceid': input.trip?.allianceid,
      'affiliate.trip.sid': input.trip?.sid,
      'affiliate.klook.aid': input.klook?.aid,
      'affiliate.kkday.cid': input.kkday?.cid,
    };
  }

  private clean(raw: string, key: string): string {
    if (typeof raw !== 'string') {
      throw new BadRequestException(`${key} must be a string`);
    }
    const value = raw.trim();
    if (value.length > MAX_ID_LENGTH) {
      throw new BadRequestException(`${key} must be ${MAX_ID_LENGTH} characters or fewer`);
    }
    if (!ID_PATTERN.test(value)) {
      throw new BadRequestException(
        `${key} may only contain letters, digits, ".", "_", "~", "-"`,
      );
    }
    return value;
  }
}
