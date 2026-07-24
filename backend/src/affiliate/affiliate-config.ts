/**
 * Affiliate partner IDs, editable from the admin console and stored as plain
 * `Setting` rows so they inherit the settings audit trail / rollback. The IDs
 * are not secret — they end up in the outbound URLs — so the read endpoint is
 * public. The query-parameter names each ID maps to live in the frontend link
 * builder (frontend/lib/affiliate.ts); here we only store the values.
 */
export type AffiliateConfig = {
  booking: { aid: string };
  trip: { allianceid: string; sid: string };
  klook: { aid: string };
  kkday: { cid: string };
};

/** One editable ID field: its Setting key and how to read/write it on the config object. */
export type AffiliateConfigField = {
  key: string;
  get: (config: AffiliateConfig) => string;
  set: (config: AffiliateConfig, value: string) => void;
  description: string;
};

export const AFFILIATE_CONFIG_FIELDS: AffiliateConfigField[] = [
  {
    key: 'affiliate.booking.aid',
    get: (c) => c.booking.aid,
    set: (c, v) => {
      c.booking.aid = v;
    },
    description: 'Booking.com affiliate id (aid)',
  },
  {
    key: 'affiliate.trip.allianceid',
    get: (c) => c.trip.allianceid,
    set: (c, v) => {
      c.trip.allianceid = v;
    },
    description: 'Trip.com Allianceid',
  },
  {
    key: 'affiliate.trip.sid',
    get: (c) => c.trip.sid,
    set: (c, v) => {
      c.trip.sid = v;
    },
    description: 'Trip.com SID',
  },
  {
    key: 'affiliate.klook.aid',
    get: (c) => c.klook.aid,
    set: (c, v) => {
      c.klook.aid = v;
    },
    description: 'Klook affiliate id (aid)',
  },
  {
    key: 'affiliate.kkday.cid',
    get: (c) => c.kkday.cid,
    set: (c, v) => {
      c.kkday.cid = v;
    },
    description: 'KKday affiliate id (cid)',
  },
];

export function emptyAffiliateConfig(): AffiliateConfig {
  return {
    booking: { aid: '' },
    trip: { allianceid: '', sid: '' },
    klook: { aid: '' },
    kkday: { cid: '' },
  };
}
