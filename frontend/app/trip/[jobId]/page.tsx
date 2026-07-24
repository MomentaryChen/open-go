import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { ItineraryView } from '@/components/itinerary-view'
import { LanguageToggle } from '@/components/language-toggle'
import { ShareActions, ShareCta } from '@/components/share-actions'
import { ThemeToggle } from '@/components/theme-toggle'
import { fmt } from '@/lib/i18n'
import { getServerDictionary, getServerLocale } from '@/lib/i18n/server'
import { siteUrl } from '@/lib/server-api'
import type { Itinerary } from '@/lib/trip'
import { getStoredTrip } from '@/lib/trip-server'

type Params = { params: Promise<{ jobId: string }> }

/**
 * schema.org TouristTrip markup so search engines can read the itinerary as
 * structured data instead of prose — the backbone of the trip pages' SEO.
 * Only items with coordinates are listed; without geo an entry adds noise,
 * not rich-result eligibility.
 */
function tripJsonLd(itinerary: Itinerary, url: string) {
  const places = itinerary.days
    .flatMap((day) => day.items)
    .filter(
      (item) => item.name && item.latitude != null && item.longitude != null,
    )

  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: itinerary.title,
    description: itinerary.summary,
    url,
    provider: { '@type': 'Organization', name: 'OpenGo', url: siteUrl() },
    itinerary: {
      '@type': 'ItemList',
      numberOfItems: places.length,
      itemListElement: places.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'TouristAttraction',
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          ...(item.address ? { address: item.address } : {}),
          geo: {
            '@type': 'GeoCoordinates',
            latitude: item.latitude,
            longitude: item.longitude,
          },
        },
      })),
    },
  }
}

/** Trim to a length that survives the LINE / Facebook / Slack preview crop. */
function preview(text: string, max = 160) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

// Rendered per request: a job's itinerary is written once and read by whoever
// holds the link, so there is nothing to prerender at build time.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { jobId } = await params
  const [trip, t, locale] = await Promise.all([
    getStoredTrip(jobId),
    getServerDictionary(),
    getServerLocale(),
  ])

  if (!trip) {
    return { title: t.meta.tripNotFoundTitle, robots: { index: false } }
  }

  const { itinerary } = trip
  const title = fmt(t.meta.tripTitle, {
    title: itinerary.title,
    destination: itinerary.destination,
    days: itinerary.durationDays,
  })
  const description = preview(
    itinerary.summary ||
      fmt(t.meta.tripDescription, {
        sources: itinerary.references.length,
        destination: itinerary.destination,
        days: itinerary.durationDays,
      }),
  )

  return {
    title,
    description,
    // Shared links are the main way this page is opened; without these the
    // preview card falls back to the site-wide default and every trip looks
    // identical in chat apps.
    openGraph: {
      type: 'article',
      title,
      description,
      url: `/trip/${jobId}`,
      siteName: 'OpenGo',
      locale: locale === 'en' ? 'en_US' : 'zh_TW',
    },
    // opengraph-image.tsx in this folder supplies the image; Next injects it
    // into openGraph.images and twitter.images automatically.
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `/trip/${jobId}` },
  }
}

export default async function SharedTripPage({ params }: Params) {
  const { jobId } = await params
  const [trip, t] = await Promise.all([getStoredTrip(jobId), getServerDictionary()])
  if (!trip) notFound()

  const jsonLd = tripJsonLd(trip.itinerary, `${siteUrl()}/trip/${jobId}`)

  return (
    <main className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        // `<` escaped so itinerary text can never close the script tag early.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-4 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:border-primary/40"
          >
            <Sparkles className="h-4 w-4" />
            {t.nav.planMyTrip}
          </Link>
          <div className="flex items-center gap-2">
            <ShareActions jobId={jobId} title={trip.itinerary.title} />
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        {trip.keyword && (
          <p className="mt-6 text-sm text-muted-foreground">
            {fmt(t.meta.fromKeyword, { keyword: trip.keyword })}
          </p>
        )}

        <div className="mt-4">
          <ItineraryView itinerary={trip.itinerary} jobId={jobId} />
        </div>

        <ShareCta jobId={jobId} title={trip.itinerary.title} />
      </div>
    </main>
  )
}
