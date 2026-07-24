import { cache } from 'react'
import { serverApiBaseUrl } from '@/lib/server-api'
import type { Itinerary } from '@/lib/trip'

export type StoredTrip = {
  jobId: string
  keyword: string
  itinerary: Itinerary
}

/**
 * Read a finished job's stored itinerary on the server.
 *
 * Wrapped in `cache` so generateMetadata and the page body share one request
 * instead of hitting the backend twice per render.
 *
 * Returns null for every "nothing to show" case — job missing, backend down,
 * or still running — so callers can render notFound() rather than leaking a
 * fetch error into the page.
 */
export const getStoredTrip = cache(
  async (jobId: string): Promise<StoredTrip | null> => {
    let response: Response
    try {
      response = await fetch(
        `${serverApiBaseUrl()}/trips/${encodeURIComponent(jobId)}`,
        { cache: 'no-store' },
      )
    } catch {
      return null
    }
    if (!response.ok) return null

    const job = (await response.json()) as {
      keyword?: string
      itinerary?: { data?: Itinerary } | null
    }
    if (!job.itinerary?.data) return null

    return {
      jobId,
      keyword: job.keyword ?? '',
      itinerary: job.itinerary.data,
    }
  },
)
