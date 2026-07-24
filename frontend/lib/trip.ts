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
