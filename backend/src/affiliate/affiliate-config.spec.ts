import { affiliateLinksEnabled } from './affiliate-config';

describe('affiliateLinksEnabled', () => {
  const original = process.env.TRIP_AFFILIATE_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.TRIP_AFFILIATE_ENABLED;
    else process.env.TRIP_AFFILIATE_ENABLED = original;
  });

  it('keeps partner links on unless the flag is false', () => {
    delete process.env.TRIP_AFFILIATE_ENABLED;
    expect(affiliateLinksEnabled()).toBe(true);
    process.env.TRIP_AFFILIATE_ENABLED = 'true';
    expect(affiliateLinksEnabled()).toBe(true);
    process.env.TRIP_AFFILIATE_ENABLED = 'false';
    expect(affiliateLinksEnabled()).toBe(false);
  });
});
