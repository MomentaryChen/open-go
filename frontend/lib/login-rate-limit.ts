import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Brute-force protection for the admin login.
 *
 * State is per-process and in memory: it resets on deploy and is not shared
 * across replicas. That is deliberate — a shared store is not worth the
 * dependency here, and the throttle below still caps throughput even when the
 * per-IP counter is evaded.
 */

/** Failures allowed from one client before it is locked out. */
const MAX_FAILURES = 5
/** Failures older than this stop counting toward the limit. */
const WINDOW_MS = 15 * 60 * 1000
/** How long a client stays locked out once it trips the limit. */
const LOCKOUT_MS = 15 * 60 * 1000
/**
 * Delay added to every failed attempt. x-forwarded-for is client-supplied, so
 * per-IP counting alone can be sidestepped by rotating the header; a fixed
 * per-attempt cost caps guess throughput regardless of the key. It never
 * applies to a correct password, so it cannot lock out the real operator.
 */
const FAILURE_DELAY_MS = 300

type Attempt = { failures: number; firstFailureAt: number; lockedUntil: number }

const attempts = new Map<string, Attempt>()

/**
 * Best-effort client identity. Behind a proxy this is the forwarded address;
 * it is spoofable, which is why FAILURE_DELAY_MS exists as a backstop.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

/** Drops entries that can no longer affect a decision, bounding the map. */
function prune(now: number) {
  for (const [key, attempt] of attempts) {
    const expired =
      attempt.lockedUntil <= now && now - attempt.firstFailureAt > WINDOW_MS
    if (expired) attempts.delete(key)
  }
}

export type LockoutState = { locked: boolean; retryAfterSeconds: number }

export function checkLockout(key: string): LockoutState {
  const now = Date.now()
  prune(now)

  const attempt = attempts.get(key)
  if (!attempt || attempt.lockedUntil <= now) {
    return { locked: false, retryAfterSeconds: 0 }
  }
  return {
    locked: true,
    retryAfterSeconds: Math.ceil((attempt.lockedUntil - now) / 1000),
  }
}

/** Records a failure and reports whether it tripped the lockout. */
export function recordFailure(key: string): LockoutState {
  const now = Date.now()
  const existing = attempts.get(key)

  // A stale window starts over rather than accumulating forever.
  const attempt: Attempt =
    existing && now - existing.firstFailureAt <= WINDOW_MS
      ? existing
      : { failures: 0, firstFailureAt: now, lockedUntil: 0 }

  attempt.failures += 1
  if (attempt.failures >= MAX_FAILURES) {
    attempt.lockedUntil = now + LOCKOUT_MS
  }
  attempts.set(key, attempt)

  return attempt.lockedUntil > now
    ? { locked: true, retryAfterSeconds: Math.ceil(LOCKOUT_MS / 1000) }
    : { locked: false, retryAfterSeconds: 0 }
}

export function recordSuccess(key: string) {
  attempts.delete(key)
}

export function failureDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS))
}

/**
 * Compares two secrets without leaking their relationship through timing.
 * Both sides are hashed first so timingSafeEqual always sees equal-length
 * buffers — it throws otherwise, and the length difference would itself leak.
 */
export function secretsMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string') return false
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Remaining attempts before lockout, for the operator-facing message. */
export function remainingAttempts(key: string): number {
  const attempt = attempts.get(key)
  if (!attempt || Date.now() - attempt.firstFailureAt > WINDOW_MS) {
    return MAX_FAILURES
  }
  return Math.max(0, MAX_FAILURES - attempt.failures)
}
