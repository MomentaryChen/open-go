/**
 * Admission control for public `POST /trips`.
 *
 * The counter is per process and in memory: a restart clears it, and a second
 * replica does not share it. That matches the in-process trip queue. The
 * socket address is the client key (Express `req.ip`); do not trust a
 * client-supplied forwarding header here.
 */

export type CreateLimitConfig = {
  /** When false, public creation is rejected before any quota math. */
  publicCreate: boolean;
  /** Accepted creates per key per window. `0` or less disables the cap. */
  limit: number;
  /** Sliding window length. `0` or less disables the cap. */
  windowMs: number;
};

export type CreateLimitDecision =
  | { ok: true }
  | {
      ok: false;
      status: 403 | 429;
      code: 'TRIP_PUBLIC_CREATE_DISABLED' | 'TRIP_RATE_LIMITED';
      message: string;
      retryAfterSeconds: number;
    };

/** Drop stamps outside the window. Mutates and returns the kept list. */
function recentStamps(stamps: number[], windowStart: number): number[] {
  return stamps.filter((stamp) => stamp > windowStart);
}

/**
 * Records one accepted create, or reports why it must be refused.
 * `hits` is the process-wide store, keyed by client address.
 */
export function consumeCreateSlot(
  hits: Map<string, number[]>,
  key: string,
  now: number,
  config: CreateLimitConfig,
): CreateLimitDecision {
  if (!config.publicCreate) {
    return {
      ok: false,
      status: 403,
      code: 'TRIP_PUBLIC_CREATE_DISABLED',
      message: 'Public trip creation is disabled on this server.',
      retryAfterSeconds: 0,
    };
  }

  if (config.limit <= 0 || config.windowMs <= 0) return { ok: true };

  const windowStart = now - config.windowMs;
  const recent = recentStamps(hits.get(key) ?? [], windowStart);
  if (recent.length >= config.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recent[0] + config.windowMs - now) / 1000),
    );
    hits.set(key, recent);
    return {
      ok: false,
      status: 429,
      code: 'TRIP_RATE_LIMITED',
      message: 'Too many trip requests from this address. Try again later.',
      retryAfterSeconds,
    };
  }

  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) prune(hits, windowStart);
  return { ok: true };
}

function prune(hits: Map<string, number[]>, windowStart: number) {
  for (const [key, stamps] of hits) {
    const recent = recentStamps(stamps, windowStart);
    if (recent.length === 0) hits.delete(key);
    else hits.set(key, recent);
  }
}
