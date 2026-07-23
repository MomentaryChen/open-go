'use client'

import { useMemo, useState } from 'react'
import { Play, ExternalLink, Eye, Pause } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface YouTubeVideoCardProps {
  title?: string
  videoId?: string
  channel?: string
  views?: string
  keyword?: string
  index?: number
  isPlaying?: boolean
  onPlay?: () => void
  onStop?: () => void
}

function parseYouTubeVideoId(videoId?: string) {
  const raw = videoId?.trim()
  if (!raw) return ''

  if (!raw.includes('http')) return raw

  try {
    const url = new URL(raw)
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.replace('/', '')
    }

    if (url.hostname.includes('youtube.com')) {
      const watchId = url.searchParams.get('v')
      if (watchId) return watchId

      const pathParts = url.pathname.split('/').filter(Boolean)
      const embedIndex = pathParts.findIndex((part) => part === 'embed')
      if (embedIndex >= 0 && pathParts[embedIndex + 1]) {
        return pathParts[embedIndex + 1]
      }
    }
  } catch {
    return raw
  }

  return raw
}

function getVideoUrls(videoId?: string, keyword?: string) {
  const trimmedId = parseYouTubeVideoId(videoId)
  if (trimmedId) {
    return {
      watchUrl: `https://www.youtube.com/watch?v=${trimmedId}`,
      embedUrl: `https://www.youtube.com/embed/${trimmedId}?autoplay=1&rel=0`,
      thumbnailUrl: `https://img.youtube.com/vi/${trimmedId}/hqdefault.jpg`,
      canEmbed: true,
    }
  }

  const query = encodeURIComponent(keyword?.trim() || '')
  return {
    watchUrl: `https://www.youtube.com/results?search_query=${query}`,
    embedUrl: '',
    thumbnailUrl: '',
    canEmbed: false,
  }
}

export function YouTubeVideoCard({
  title,
  videoId,
  channel,
  views,
  keyword,
  index,
  isPlaying: controlledIsPlaying,
  onPlay,
  onStop,
}: YouTubeVideoCardProps) {
  const [uncontrolledIsPlaying, setUncontrolledIsPlaying] = useState(false)
  const isControlled = typeof controlledIsPlaying === 'boolean'
  const isPlaying = isControlled ? controlledIsPlaying : uncontrolledIsPlaying

  const { watchUrl, embedUrl, thumbnailUrl, canEmbed } = useMemo(
    () => getVideoUrls(videoId, keyword),
    [videoId, keyword],
  )

  const cardTitle = title || keyword || `YouTube 影片 ${typeof index === 'number' ? index + 1 : ''}`.trim()
  const cardChannel = channel || 'YouTube'
  const cardViews = views || '點擊播放'
  const startPlaying = () => {
    if (!canEmbed) return
    if (onPlay) onPlay()
    if (!isControlled) setUncontrolledIsPlaying(true)
  }
  const stopPlaying = () => {
    if (onStop) onStop()
    if (!isControlled) setUncontrolledIsPlaying(false)
  }

  return (
    <Card className="group overflow-hidden bg-card border-border hover:shadow-md hover:border-red-500/30 transition-all duration-200">
      <CardContent className="p-0">
        {/* Video player area */}
        {isPlaying && canEmbed ? (
          <div className="relative aspect-video w-full bg-black">
            <iframe
              src={embedUrl}
              title={cardTitle}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={startPlaying}
            className="relative aspect-video w-full bg-gradient-to-br from-red-500 to-red-700 overflow-hidden"
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={cardTitle}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            ) : null}
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                <Play className="h-6 w-6 text-red-600 fill-red-600 ml-0.5" />
              </div>
            </div>
          </button>
        )}

        <div className="flex gap-3 p-3">
          {/* Video info */}
          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            <h3 className="text-sm font-medium text-card-foreground line-clamp-2 leading-snug group-hover:text-red-600 transition-colors">
              {cardTitle}
            </h3>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground truncate">{cardChannel}</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-2">
                <Eye className="h-3 w-3" />
                <span>{cardViews}</span>
              </div>
            </div>
          </div>

          {isPlaying && canEmbed ? (
            <button
              type="button"
              onClick={stopPlaying}
              className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 mt-1"
              aria-label="停止播放"
            >
              <Pause className="h-4 w-4" />
            </button>
          ) : (
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-red-500 transition-colors shrink-0 mt-1"
              aria-label="在 YouTube 開啟"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
