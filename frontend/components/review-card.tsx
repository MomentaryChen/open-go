'use client'

import { Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface Review {
  author: string
  rating: number
  text: string
  date: string
}

export function ReviewCard(review: Review) {
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-3.5 w-3.5 ${
          i < Math.floor(rating)
            ? 'fill-amber-400 text-amber-400'
            : 'fill-muted text-muted'
        }`}
      />
    ))
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 text-primary-foreground font-medium text-sm">
            {review.author.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-card-foreground text-sm">{review.author}</span>
              <span className="text-xs text-muted-foreground">{review.date}</span>
            </div>
            <div className="flex items-center gap-0.5 my-1">
              {renderStars(review.rating)}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{review.text}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
