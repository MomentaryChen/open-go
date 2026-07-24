import type { MetadataRoute } from 'next'
import { serverApiBaseUrl, siteUrl } from '@/lib/server-api'

/** The two gallery fields the sitemap cares about. */
type GalleryEntry = { jobId: string; createdAt: string }

// The set of finished trips grows whenever a job completes, so the sitemap is
// generated per request rather than baked at build time.
export const dynamic = 'force-dynamic'

/**
 * Every finished itinerary is a crawlable landing page; listing them here is
 * what turns generated trips into long-tail search entries. The gallery
 * endpoint already excludes unfinished jobs.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()

  const pages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/explore`, changeFrequency: 'daily', priority: 0.8 },
  ]

  let trips: GalleryEntry[] = []
  try {
    const response = await fetch(`${serverApiBaseUrl()}/trips/gallery`, {
      cache: 'no-store',
    })
    if (response.ok) trips = (await response.json()) as GalleryEntry[]
  } catch {
    // Backend unreachable — serve the static pages rather than erroring the
    // whole sitemap; crawlers treat a 5xx sitemap as "site broken".
  }

  return [
    ...pages,
    ...trips.map((trip) => ({
      url: `${base}/trip/${trip.jobId}`,
      lastModified: new Date(trip.createdAt),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ]
}
