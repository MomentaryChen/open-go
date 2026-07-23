'use client'

import { Star, MapPin, Lightbulb } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface AttractionCardProps {
  name: string
  type: string
  rating: number
  reviewCount: number
  highlights: string[]
  tips: string
  index: number
  isSelected: boolean
  onSelect: (index: number | null) => void
}

export function AttractionCard({
  name,
  type,
  rating,
  reviewCount,
  highlights,
  tips,
  index,
  isSelected,
  onSelect,
}: AttractionCardProps) {
  const stars = Array.from({ length: 5 }, (_, i) => i < Math.floor(rating))

  return (
    <button
      onClick={() => onSelect(isSelected ? null : index)}
      className={cn(
        'w-full text-left rounded-xl border p-4 transition-all duration-200',
        'hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected
          ? 'border-orange-400 bg-orange-50 shadow-md ring-1 ring-orange-400'
          : 'border-border bg-card hover:border-primary/40',
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0',
              isSelected
                ? 'bg-orange-400 text-white'
                : 'bg-primary/10 text-primary',
            )}
          >
            {index + 1}
          </span>
          <span className="font-semibold text-foreground text-sm leading-snug truncate">{name}</span>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            'shrink-0 text-xs',
            isSelected && 'bg-orange-100 text-orange-600 border-orange-200',
          )}
        >
          {type}
        </Badge>
      </div>

      {/* Rating row */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-0.5">
          {stars.map((filled, i) => (
            <Star
              key={i}
              className={cn('h-3.5 w-3.5', filled ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted')}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-foreground">{rating.toFixed(1)}</span>
        <span className="text-xs text-muted-foreground">({reviewCount.toLocaleString()} 評論)</span>
      </div>

      {/* Highlights */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {highlights.map((h) => (
          <span
            key={h}
            className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
          >
            {h}
          </span>
        ))}
      </div>

      {/* Tip */}
      <div className="flex items-start gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">{tips}</p>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="mt-3 pt-3 border-t border-orange-200 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-xs text-orange-500 font-medium">已在地圖上標示</span>
        </div>
      )}
    </button>
  )
}
