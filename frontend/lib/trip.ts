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

/** "約 800 公尺" below 1 km, otherwise "約 12.5 公里". */
export function formatDistance(km: number): string {
  if (km < 1) return `約 ${Math.round(km * 100) * 10} 公尺`
  return `約 ${km >= 10 ? Math.round(km) : km.toFixed(1)} 公里`
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
  address?: string | null,
  destination?: string,
): string {
  const parts = [name.trim(), address?.trim() || destination?.trim() || '']
  const query = parts.filter(Boolean).join(' ')
  // hl opens the place page (reviews, labels, buttons) in Traditional Chinese.
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=zh-TW`
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

export const TRIP_STAGES: Array<{ status: TripStatus; label: string }> = [
  { status: 'planning', label: '分解關鍵字' },
  { status: 'searching', label: '搜尋網路' },
  { status: 'crawling', label: '抓取文章' },
  { status: 'composing', label: 'AI 整理行程' },
  { status: 'done', label: '完成' },
]

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

export const COMPANION_OPTIONS: { value: TripCompanions; label: string }[] = [
  { value: 'solo', label: '一個人' },
  { value: 'couple', label: '情侶' },
  { value: 'family', label: '親子' },
  { value: 'friends', label: '朋友' },
  { value: 'parents', label: '長輩同行' },
  { value: 'group', label: '團體' },
]

export const PACE_OPTIONS: { value: TripPace; label: string }[] = [
  { value: 'relaxed', label: '悠閒' },
  { value: 'balanced', label: '適中' },
  { value: 'packed', label: '緊湊' },
]

export const BUDGET_OPTIONS: { value: TripBudget; label: string }[] = [
  { value: 'budget', label: '經濟' },
  { value: 'moderate', label: '中等' },
  { value: 'comfort', label: '舒適' },
  { value: 'luxury', label: '奢華' },
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
