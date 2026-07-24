/**
 * Structured traveller preferences: the explicit constraints a traveller can
 * set alongside their free-text keyword — trip length, who they travel with,
 * pace, budget band, and places to include / avoid.
 *
 * These override what the pipeline would otherwise *guess* from the keyword
 * alone. The keyword stays the primary input; every field here is optional and
 * falls back to the model's inference when unset.
 *
 * Kept dependency-free (no zod, no Nest) so the controller, trip service,
 * planner and composer can all share one definition without module cycles.
 */

export const TRIP_PACES = ['relaxed', 'balanced', 'packed'] as const;
export type TripPace = (typeof TRIP_PACES)[number];

export const TRIP_BUDGETS = ['budget', 'moderate', 'comfort', 'luxury'] as const;
export type TripBudget = (typeof TRIP_BUDGETS)[number];

export const TRIP_COMPANIONS = [
  'solo',
  'couple',
  'family',
  'friends',
  'parents',
  'group',
] as const;
export type TripCompanions = (typeof TRIP_COMPANIONS)[number];

export type TripPreferences = {
  /** Explicit trip length in days; null lets the planner infer it. */
  durationDays: number | null;
  companions: TripCompanions | null;
  pace: TripPace | null;
  budget: TripBudget | null;
  /** Places the traveller wants included when the documents support them. */
  mustVisit: string[];
  /** Places or kinds of stops to keep out of the itinerary entirely. */
  avoid: string[];
};

export const EMPTY_PREFERENCES: TripPreferences = {
  durationDays: null,
  companions: null,
  pace: null,
  budget: null,
  mustVisit: [],
  avoid: [],
};

const MAX_DAYS = 30;
const MAX_LIST_ITEMS = 20;
const MAX_ITEM_LENGTH = 100;

function toEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** Trim, drop blanks, cap length, de-duplicate (case-insensitively), cap count. */
function toList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().slice(0, MAX_ITEM_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_LIST_ITEMS) break;
  }
  return out;
}

/**
 * Coerce arbitrary request-body / persisted JSON into a well-formed
 * TripPreferences. Never throws: unknown fields are dropped, out-of-range days
 * are clamped, and invalid enum values fall back to null. Legacy jobs stored
 * without preferences normalize to EMPTY_PREFERENCES.
 */
export function normalizePreferences(input: unknown): TripPreferences {
  const obj =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};

  let durationDays: number | null = null;
  const days = obj.durationDays;
  if (typeof days === 'number' && Number.isFinite(days)) {
    durationDays = Math.min(MAX_DAYS, Math.max(1, Math.round(days)));
  }

  return {
    durationDays,
    companions: toEnum(obj.companions, TRIP_COMPANIONS),
    pace: toEnum(obj.pace, TRIP_PACES),
    budget: toEnum(obj.budget, TRIP_BUDGETS),
    mustVisit: toList(obj.mustVisit),
    avoid: toList(obj.avoid),
  };
}

export function hasAnyPreference(p: TripPreferences): boolean {
  return (
    p.durationDays != null ||
    p.companions != null ||
    p.pace != null ||
    p.budget != null ||
    p.mustVisit.length > 0 ||
    p.avoid.length > 0
  );
}

/**
 * A stable string identifying a set of preferences, so the reuse cache treats
 * "same keyword, different preferences" as distinct jobs. Field and list order
 * do not affect the key; list items are compared case-insensitively.
 */
export function preferencesCacheKey(p: TripPreferences): string {
  return JSON.stringify({
    d: p.durationDays ?? '',
    c: p.companions ?? '',
    p: p.pace ?? '',
    b: p.budget ?? '',
    m: [...p.mustVisit].map((s) => s.toLowerCase()).sort(),
    a: [...p.avoid].map((s) => s.toLowerCase()).sort(),
  });
}

const COMPANION_TEXT: Record<TripCompanions, string> = {
  solo: 'a solo traveller',
  couple: 'a couple',
  family: 'a family with children',
  friends: 'a group of friends',
  parents: 'travelling with elderly parents',
  group: 'a larger group',
};

const PACE_TEXT: Record<TripPace, string> = {
  relaxed: 'relaxed — fewer stops per day, unhurried, room to linger',
  balanced: 'balanced — a moderate number of stops per day',
  packed: 'packed — many stops per day, time used efficiently',
};

const BUDGET_TEXT: Record<TripBudget, string> = {
  budget:
    'budget-conscious — favour free/cheap attractions, street food, economical transport and lodging areas',
  moderate: 'moderate — mid-range dining and lodging',
  comfort: 'comfortable — willing to pay more for convenience and quality',
  luxury: 'luxury — premium dining, experiences and lodging areas',
};

/**
 * Bullet lines describing the traveller's explicit constraints for the LLM.
 * Returns an empty string when nothing is set, so callers can skip the block.
 */
export function describePreferences(p: TripPreferences): string {
  const lines: string[] = [];
  if (p.durationDays != null) {
    lines.push(
      `- Trip length: exactly ${p.durationDays} day(s) — plan for this many days, not a guessed number.`,
    );
  }
  if (p.companions) {
    lines.push(
      `- Travelling as: ${COMPANION_TEXT[p.companions]} — tailor venues, pacing and tips accordingly.`,
    );
  }
  if (p.pace) {
    lines.push(`- Preferred pace: ${PACE_TEXT[p.pace]}.`);
  }
  if (p.budget) {
    lines.push(`- Budget: ${BUDGET_TEXT[p.budget]}.`);
  }
  if (p.mustVisit.length) {
    lines.push(
      `- Must include when the documents support them: ${p.mustVisit.join(', ')}.`,
    );
  }
  if (p.avoid.length) {
    lines.push(
      `- Avoid entirely: ${p.avoid.join(', ')} — do not schedule these places or kinds of stops.`,
    );
  }
  return lines.join('\n');
}
