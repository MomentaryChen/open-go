'use client'

import { MapPin, Calendar, Utensils, Youtube, MessageSquare, Compass } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { AttractionCard } from '@/components/attraction-card'
import { ReviewCard } from '@/components/review-card'
import { YouTubeVideoCard } from '@/components/youtube-video-card'

interface TravelData {
  destination: string
  overview: string
  bestTimeToVisit: string
  attractions: Array<{
    name: string
    description: string
    rating: number
    reviewCount: number
    category: string
    highlights: string[]
    tips: string
  }>
  localFood: Array<{
    name: string
    description: string
  }>
  reviews: Array<{
    author: string
    rating: number
    comment: string
    date: string
  }>
  youtubeKeywords: string[]
}

interface TravelResultsProps {
  data: Partial<TravelData>
  isStreaming: boolean
}

export function TravelResults({ data, isStreaming }: TravelResultsProps) {
  if (!data.destination && !isStreaming) return null

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {/* Header */}
      {data.destination && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">目的地</span>
          </div>
          <h2 className="text-4xl font-bold text-foreground mb-2">{data.destination}</h2>
          {isStreaming && (
            <p className="text-muted-foreground animate-pulse">正在載入旅遊資訊...</p>
          )}
        </div>
      )}

      {/* Overview */}
      {data.overview && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <Compass className="h-5 w-5 text-primary" />
              地區概述
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">{data.overview}</p>
          </CardContent>
        </Card>
      )}

      {/* Best Time to Visit */}
      {data.bestTimeToVisit && (
        <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">最佳旅遊時間</p>
                <p className="text-lg font-semibold text-card-foreground">{data.bestTimeToVisit}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attractions */}
      {data.attractions && data.attractions.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-6">
            <MapPin className="h-6 w-6 text-primary" />
            <h3 className="text-2xl font-bold text-foreground">熱門景點</h3>
            <span className="text-muted-foreground">({data.attractions.length} 個)</span>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.attractions.map((attraction, index) => (
              <AttractionCard key={index} attraction={attraction} />
            ))}
          </div>
        </section>
      )}

      <Separator className="bg-border" />

      {/* Local Food */}
      {data.localFood && data.localFood.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Utensils className="h-6 w-6 text-accent" />
            <h3 className="text-2xl font-bold text-foreground">必吃美食</h3>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.localFood.map((food, index) => (
              <Card key={index} className="bg-card border-border hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-card-foreground mb-2">{food.name}</h4>
                  <p className="text-sm text-muted-foreground">{food.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* YouTube Videos */}
      {data.youtubeKeywords && data.youtubeKeywords.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Youtube className="h-6 w-6 text-red-600" />
            <h3 className="text-2xl font-bold text-foreground">相關影片</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {data.youtubeKeywords.map((keyword, index) => (
              <YouTubeVideoCard key={index} keyword={keyword} index={index} />
            ))}
          </div>
        </section>
      )}

      {/* Reviews */}
      {data.reviews && data.reviews.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-6">
            <MessageSquare className="h-6 w-6 text-primary" />
            <h3 className="text-2xl font-bold text-foreground">旅客評論</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {data.reviews.map((review, index) => (
              <ReviewCard key={index} review={review} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
