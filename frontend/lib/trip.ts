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

export type Itinerary = {
  title: string
  destination: string
  durationDays: number
  summary: string
  bestSeason: string
  budgetEstimate: string
  days: Array<{ day: number; theme: string; items: ItineraryItem[] }>
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
