import { consumeCreateSlot, CreateLimitConfig } from './trip-create-limit';

const HOUR = 60 * 60 * 1000;

const limited: CreateLimitConfig = {
  publicCreate: true,
  limit: 2,
  windowMs: HOUR,
};

describe('consumeCreateSlot', () => {
  it('allows creates until the limit, then asks the caller to wait', () => {
    const hits = new Map<string, number[]>();
    const now = 1_000_000;

    expect(consumeCreateSlot(hits, '10.0.0.1', now, limited)).toEqual({
      ok: true,
    });
    expect(consumeCreateSlot(hits, '10.0.0.1', now + 1000, limited)).toEqual({
      ok: true,
    });

    const blocked = consumeCreateSlot(hits, '10.0.0.1', now + 2000, limited);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.status).toBe(429);
      expect(blocked.code).toBe('TRIP_RATE_LIMITED');
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('counts each address separately', () => {
    const hits = new Map<string, number[]>();
    consumeCreateSlot(hits, 'a', 0, limited);
    consumeCreateSlot(hits, 'a', 1, limited);
    expect(consumeCreateSlot(hits, 'b', 2, limited)).toEqual({ ok: true });
  });

  it('opens the window again after the oldest hit expires', () => {
    const hits = new Map<string, number[]>();
    consumeCreateSlot(hits, 'a', 0, limited);
    consumeCreateSlot(hits, 'a', 1, limited);
    expect(consumeCreateSlot(hits, 'a', HOUR + 1, limited)).toEqual({
      ok: true,
    });
  });

  it('refuses every create when public creation is off', () => {
    const hits = new Map<string, number[]>();
    const decision = consumeCreateSlot(hits, 'a', 0, {
      publicCreate: false,
      limit: 10,
      windowMs: HOUR,
    });
    expect(decision).toMatchObject({
      ok: false,
      status: 403,
      code: 'TRIP_PUBLIC_CREATE_DISABLED',
    });
    expect(hits.size).toBe(0);
  });

  it('does not cap when the limit is disabled', () => {
    const hits = new Map<string, number[]>();
    const config = { publicCreate: true, limit: 0, windowMs: HOUR };
    expect(consumeCreateSlot(hits, 'a', 0, config)).toEqual({ ok: true });
    expect(consumeCreateSlot(hits, 'a', 1, config)).toEqual({ ok: true });
    expect(hits.size).toBe(0);
  });
});
