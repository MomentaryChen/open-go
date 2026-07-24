export type TripHistoryEntry = {
  jobId: string
  keyword: string
  /** ISO timestamp of when the query was started. */
  createdAt: string
  /**
   * Whether the pipeline finished. Entries are written as soon as the job is
   * created so a refresh mid-run can pick it back up; absent on entries stored
   * before this field existed, which are all finished results.
   */
  done?: boolean
}

const STORAGE_KEY = 'opengo_trip_history'
const MAX_ENTRIES = 10

/** Read the stored history; newest first. Safe on the server (returns []). */
export function loadTripHistory(): TripHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is TripHistoryEntry =>
        !!entry &&
        typeof (entry as TripHistoryEntry).jobId === 'string' &&
        typeof (entry as TripHistoryEntry).keyword === 'string' &&
        typeof (entry as TripHistoryEntry).createdAt === 'string',
    )
  } catch {
    return []
  }
}

/**
 * Record a query. Re-running the same keyword replaces the older entry (latest
 * jobId wins) and moves it to the top. Capped at MAX_ENTRIES.
 */
export function addTripHistory(
  entry: Omit<TripHistoryEntry, 'createdAt'>,
): TripHistoryEntry[] {
  const next = [
    { ...entry, createdAt: new Date().toISOString() },
    ...loadTripHistory().filter(
      (existing) =>
        existing.jobId !== entry.jobId && existing.keyword !== entry.keyword,
    ),
  ].slice(0, MAX_ENTRIES)
  persist(next)
  return next
}

/** Flip a running entry to finished, keeping its original start time. */
export function markTripHistoryDone(jobId: string): TripHistoryEntry[] {
  const next = loadTripHistory().map((entry) =>
    entry.jobId === jobId ? { ...entry, done: true } : entry,
  )
  persist(next)
  return next
}

/**
 * The most recent query that never reported a result, if it is recent enough
 * to still plausibly be running. Used to reattach after a refresh.
 */
export function findResumableTrip(
  maxAgeMs = 30 * 60 * 1000,
): TripHistoryEntry | null {
  const candidate = loadTripHistory().find((entry) => entry.done === false)
  if (!candidate) return null
  const age = Date.now() - new Date(candidate.createdAt).getTime()
  return age >= 0 && age < maxAgeMs ? candidate : null
}

/** Remove one entry (e.g. its job no longer exists on the backend). */
export function removeTripHistory(jobId: string): TripHistoryEntry[] {
  const next = loadTripHistory().filter((entry) => entry.jobId !== jobId)
  persist(next)
  return next
}

export function clearTripHistory(): TripHistoryEntry[] {
  persist([])
  return []
}

function persist(entries: TripHistoryEntry[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Storage full or blocked (private mode) — history is best-effort.
  }
}

/** "3 分鐘前" style label without pulling in a date library. */
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '剛剛'
  if (minutes < 60) return `${minutes} 分鐘前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}
