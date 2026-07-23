'use client'

import { useEffect, useRef, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReviewCard } from './review-card'
import { YouTubeVideoCard } from './youtube-video-card'
import { AttractionCard } from './attraction-card'
import { MapPin, Star, MessageSquare, Play, Info } from 'lucide-react'
import type { Attraction } from '@/app/search-results/page'

interface Review {
  author: string
  rating: number
  text: string
  date: string
}

interface YouTubeVideo {
  title: string
  videoId: string
  channel: string
  views: string
}

interface ResultsSidebarProps {
  location: string
  reviews: Review[]
  videos: YouTubeVideo[]
  attractions: Attraction[]
  overview: string
  categoryStats: Array<{ category: string; count: number }>
  selectedCategory: string
  onCategoryChange: (category: string) => void
  isLoading: boolean
  selectedAttractionIndex: number | null
  onAttractionSelect: (index: number | null) => void
}

export function ResultsSidebar({
  location,
  reviews,
  videos,
  attractions,
  overview,
  categoryStats,
  selectedCategory,
  onCategoryChange,
  isLoading,
  selectedAttractionIndex,
  onAttractionSelect,
}: ResultsSidebarProps) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null)

  // Auto-scroll to selected attraction card
  useEffect(() => {
    if (selectedAttractionIndex !== null && cardRefs.current[selectedAttractionIndex]) {
      cardRefs.current[selectedAttractionIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [selectedAttractionIndex])

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="attractions" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full rounded-none border-b border-border bg-background p-0 h-auto grid grid-cols-4 shrink-0">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 gap-1.5 text-xs font-medium"
          >
            <Info className="h-3.5 w-3.5" />
            概覽
          </TabsTrigger>
          <TabsTrigger
            value="attractions"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 gap-1.5 text-xs font-medium"
          >
            <MapPin className="h-3.5 w-3.5" />
            景點
          </TabsTrigger>
          <TabsTrigger
            value="reviews"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 gap-1.5 text-xs font-medium"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            評論
          </TabsTrigger>
          <TabsTrigger
            value="videos"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 gap-1.5 text-xs font-medium"
          >
            <Play className="h-3.5 w-3.5" />
            影片
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">

          {/* Overview Tab */}
          <TabsContent value="overview" className="p-5 m-0 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-foreground mb-2">關於 {location}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{overview}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: attractions.length, label: '熱門景點' },
                { value: reviews.length,    label: '旅客評論' },
                { value: videos.length,     label: '推薦影片' },
              ].map(({ value, label }) => (
                <div key={label} className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Attractions Tab */}
          <TabsContent value="attractions" className="p-4 m-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onCategoryChange('all')}
                className={`px-3 py-1 text-xs rounded-full border ${
                  selectedCategory === 'all'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border'
                }`}
              >
                all ({categoryStats.reduce((sum, item) => sum + item.count, 0)})
              </button>
              {categoryStats.map((item) => (
                <button
                  key={item.category}
                  onClick={() => onCategoryChange(item.category)}
                  className={`px-3 py-1 text-xs rounded-full border ${
                    selectedCategory === item.category
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border'
                  }`}
                >
                  {item.category} ({item.count})
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground px-1">點擊景點可在地圖上高亮標示</p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground px-1">Loading attractions...</p>
            ) : attractions.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1">No attractions available for this category.</p>
            ) : (
              attractions.map((attraction, idx) => (
                <div
                  key={attraction.id}
                  ref={(el) => { cardRefs.current[idx] = el }}
                >
                  <AttractionCard
                    {...attraction}
                    index={idx}
                    isSelected={selectedAttractionIndex === idx}
                    onSelect={onAttractionSelect}
                  />
                </div>
              ))
            )}
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="p-4 m-0 space-y-3">
            {reviews.map((review, idx) => (
              <ReviewCard key={idx} {...review} />
            ))}
          </TabsContent>

          {/* Videos Tab */}
          <TabsContent value="videos" className="p-4 m-0 space-y-3">
            {videos.map((video, idx) => (
              <YouTubeVideoCard
                key={idx}
                {...video}
                isPlaying={activeVideoIndex === idx}
                onPlay={() => setActiveVideoIndex(idx)}
                onStop={() => setActiveVideoIndex(null)}
              />
            ))}
          </TabsContent>

        </div>
      </Tabs>
    </div>
  )
}
