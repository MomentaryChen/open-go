import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { ItineraryView } from '@/components/itinerary-view'
import { ShareActions, ShareCta } from '@/components/share-actions'
import { ThemeToggle } from '@/components/theme-toggle'
import { getStoredTrip } from '@/lib/trip-server'

type Params = { params: Promise<{ jobId: string }> }

/** Trim to a length that survives the LINE / Facebook / Slack preview crop. */
function preview(text: string, max = 160) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

// Rendered per request: a job's itinerary is written once and read by whoever
// holds the link, so there is nothing to prerender at build time.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { jobId } = await params
  const trip = await getStoredTrip(jobId)

  if (!trip) {
    return { title: '找不到這個行程 ｜ OpenGo', robots: { index: false } }
  }

  const { itinerary } = trip
  const title = `${itinerary.title}｜${itinerary.destination} ${itinerary.durationDays} 天行程`
  const description = preview(
    itinerary.summary ||
      `AI 依據 ${itinerary.references.length} 篇網路遊記整理的 ${itinerary.destination} ${itinerary.durationDays} 天行程。`,
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
      locale: 'zh_TW',
    },
    // opengraph-image.tsx in this folder supplies the image; Next injects it
    // into openGraph.images and twitter.images automatically.
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `/trip/${jobId}` },
  }
}

export default async function SharedTripPage({ params }: Params) {
  const { jobId } = await params
  const trip = await getStoredTrip(jobId)
  if (!trip) notFound()

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-4 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:border-primary/40"
          >
            <Sparkles className="h-4 w-4" />
            規劃我的行程
          </Link>
          <div className="flex items-center gap-2">
            <ShareActions jobId={jobId} title={trip.itinerary.title} />
            <ThemeToggle />
          </div>
        </div>

        {trip.keyword && (
          <p className="mt-6 text-sm text-muted-foreground">
            這份行程來自關鍵字「{trip.keyword}」
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
