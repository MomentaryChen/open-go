import { fmt, getDictionary, type Locale } from './i18n'

export type TripStatus =
  | 'pending'
  | 'planning'
  | 'searching'
  | 'crawling'
  | 'composing'
  | 'done'
  | 'failed'

export type TripProgressEvent = {
  jobId: string
  status: TripStatus
  progress: number
  message?: string | null
  crawled?: number
  total?: number
  error?: string | null
  itinerary?: Itinerary
}

export type ItineraryItem = {
  time: string
  name: string
  category: string
  description: string
  /** Street address from the source docs; null when none was given. */
  address?: string | null
  durationMinutes: number
  tips: string
  /** Approximate coordinates from the LLM; absent on results generated before the map feature. */
  latitude?: number | null
  longitude?: number | null
  sourceUrls: string[]
}

/** Overnight stay area planned for a day; absent on results generated before this feature. */
export type ItineraryStay = {
  area: string
  /** Present only on results from before the area-only change. */
  name?: string | null
  latitude?: number | null
  longitude?: number | null
  reason?: string
}

/** Great-circle distance in kilometres between two WGS84 points (haversine). */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

/** Localized "about 800 m" below 1 km, otherwise "about 12.5 km". */
export function formatDistance(km: number, locale: Locale): string {
  const t = getDictionary(locale)
  if (km < 1) return fmt(t.units.aboutMeters, { n: Math.round(km * 100) * 10 })
  return fmt(t.units.aboutKm, { n: km >= 10 ? Math.round(km) : km.toFixed(1) })
}

/**
 * Google Maps search link for a recommended place, so users can open it and
 * read reviews / photos / hours. Uses the official Maps URL API `query` param.
 *
 * The place name plus its address is the most reliable way to land on the right
 * pin (a name alone is ambiguous across cities); when no address is given, the
 * destination is appended as a coarse disambiguator.
 */
export function mapsSearchUrl(
  name: string,
  address: string | null | undefined,
  destination: string | undefined,
  locale: Locale,
): string {
  const parts = [name.trim(), address?.trim() || destination?.trim() || '']
  const query = parts.filter(Boolean).join(' ')
  // hl opens the place page (reviews, labels, buttons) in the active language.
  const hl = locale === 'en' ? 'en' : 'zh-TW'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=${hl}`
}

export type Itinerary = {
  title: string
  destination: string
  durationDays: number
  summary: string
  bestSeason: string
  budgetEstimate: string
  days: Array<{
    day: number
    theme: string
    stay?: ItineraryStay | null
    items: ItineraryItem[]
  }>
  tips: string[]
  references: Array<{ title: string; url: string }>
}

/** Pipeline stages in order; labels resolve via `t.tripStages[status]`. */
export const TRIP_STAGE_ORDER = [
  'planning',
  'searching',
  'crawling',
  'composing',
  'done',
] as const satisfies readonly TripStatus[]

export function apiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:33000'
}

// --- Structured traveller preferences -------------------------------------
// Optional overrides sent alongside the keyword so the pipeline stops guessing
// trip length / companions / pace / budget / must-see & avoid from the keyword
// alone. Values mirror the backend TripPreferences enums exactly.

export type TripPace = 'relaxed' | 'balanced' | 'packed'
export type TripBudget = 'budget' | 'moderate' | 'comfort' | 'luxury'
export type TripCompanions =
  | 'solo'
  | 'couple'
  | 'family'
  | 'friends'
  | 'parents'
  | 'group'

export type TripPreferences = {
  durationDays: number | null
  companions: TripCompanions | null
  pace: TripPace | null
  budget: TripBudget | null
  mustVisit: string[]
  avoid: string[]
}

export const EMPTY_TRIP_PREFERENCES: TripPreferences = {
  durationDays: null,
  companions: null,
  pace: null,
  budget: null,
  mustVisit: [],
  avoid: [],
}

// Option values only; labels resolve via `t.tripPreferences.*Options[value]`.
export const COMPANION_VALUES: TripCompanions[] = [
  'solo',
  'couple',
  'family',
  'friends',
  'parents',
  'group',
]

export const PACE_VALUES: TripPace[] = ['relaxed', 'balanced', 'packed']

export const BUDGET_VALUES: TripBudget[] = [
  'budget',
  'moderate',
  'comfort',
  'luxury',
]

/** Quick-pick day counts; any other value is still allowed via the number field. */
export const DURATION_OPTIONS = [2, 3, 4, 5, 7]

/** Whether any field is set — controls whether preferences are sent at all. */
export function hasTripPreferences(p: TripPreferences): boolean {
  return (
    p.durationDays != null ||
    p.companions != null ||
    p.pace != null ||
    p.budget != null ||
    p.mustVisit.length > 0 ||
    p.avoid.length > 0
  )
}

/** Count of set fields, for the collapsed panel's badge. */
export function countTripPreferences(p: TripPreferences): number {
  return (
    (p.durationDays != null ? 1 : 0) +
    (p.companions != null ? 1 : 0) +
    (p.pace != null ? 1 : 0) +
    (p.budget != null ? 1 : 0) +
    (p.mustVisit.length > 0 ? 1 : 0) +
    (p.avoid.length > 0 ? 1 : 0)
  )
}
