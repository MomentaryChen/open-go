import type { Metadata } from 'next'
import Link from 'next/link'
import { Compass, Sparkles } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { ExploreGallery, type GalleryTrip } from '@/components/explore-gallery'
import { serverApiBaseUrl } from '@/lib/server-api'

export const metadata: Metadata = {
  title: '探索行程 ｜ OpenGo',
  description: '瀏覽所有 AI 產生過的旅遊行程，依區域分類，點進去看逐日規劃。',
}

// The gallery reflects whatever jobs have finished, so it is rendered per
// request rather than prerendered.
export const dynamic = 'force-dynamic'

async function getGallery(): Promise<GalleryTrip[]> {
  try {
    const res = await fetch(`${serverApiBaseUrl()}/trips/gallery`, {
      cache: 'no-store',
    })
    if (!res.ok) return []
    return (await res.json()) as GalleryTrip[]
  } catch {
    return []
  }
}

export default async function ExplorePage() {
  const trips = await getGallery()

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-4 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:border-primary/40"
          >
            <Sparkles className="h-4 w-4" />
            規劃我的行程
          </Link>
          <ThemeToggle />
        </div>

        <div className="mt-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-4 py-2 text-primary shadow-sm">
            <Compass className="h-4 w-4" />
            <span className="text-sm font-medium">行程探索</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold md:text-4xl">
            大家查過的行程
          </h1>
          <p className="mt-3 text-muted-foreground">
            所有 AI 產生過的旅程，依區域分類，點任一張卡片看完整的逐日規劃。
          </p>
        </div>

        <ExploreGallery trips={trips} />
      </div>
    </main>
  )
}
