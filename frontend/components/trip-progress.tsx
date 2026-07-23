'use client'

import { useEffect, useState } from 'react'
import {
  BrainCircuit,
  Check,
  FileText,
  PartyPopper,
  Search,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { TRIP_STAGES, type TripProgressEvent, type TripStatus } from '@/lib/trip'

const STAGE_ORDER: TripStatus[] = ['pending', 'planning', 'searching', 'crawling', 'composing', 'done']

const STAGE_ICONS: Partial<Record<TripStatus, LucideIcon>> = {
  planning: BrainCircuit,
  searching: Search,
  crawling: FileText,
  composing: Wand2,
  done: PartyPopper,
}

/** Rotating sub-messages that keep long stages feeling alive. */
const STAGE_TICKER: Partial<Record<TripStatus, string[]>> = {
  planning: ['AI 正在理解你的需求…', '拆解目的地、天數與旅遊風格…', '規劃搜尋策略…'],
  searching: ['搜尋熱門遊記與攻略…', '比對多組關鍵字結果…', '挑選多元的資料來源…'],
  crawling: ['正在閱讀部落客的遊記…', '擷取景點與美食資訊…', '整理交通與營業時間…', '過濾廣告與無效內容…'],
  composing: ['AI 正在編排每日路線…', '平衡交通與停留時間…', '安排在地美食時段…', '為每個行程標註資料來源…'],
}

function stageState(stage: TripStatus, current: TripStatus) {
  if (current === 'failed') return 'idle'
  const currentIndex = STAGE_ORDER.indexOf(current)
  const stageIndex = STAGE_ORDER.indexOf(stage)
  if (currentIndex > stageIndex) return 'done'
  if (currentIndex === stageIndex) return current === 'done' ? 'done' : 'active'
  return 'idle'
}

function StageTicker({ status }: { status: TripStatus }) {
  const messages = STAGE_TICKER[status]
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
    if (!messages || messages.length <= 1) return
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % messages.length)
    }, 2800)
    return () => clearInterval(timer)
  }, [status, messages])

  if (!messages) return null
  return (
    <p
      key={`${status}-${index}`}
      className="mt-4 text-center text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-500"
    >
      {messages[index]}
    </p>
  )
}

export function TripProgress({ event }: { event: TripProgressEvent }) {
  const failed = event.status === 'failed'
  const running = !failed && event.status !== 'done'

  return (
    <div className="rounded-2xl border border-border bg-card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-3">
        <p className={cn('text-sm font-medium', failed ? 'text-destructive' : 'text-foreground')}>
          {failed ? (event.error ?? '行程產生失敗') : (event.message ?? '處理中…')}
        </p>
        <span className="text-sm text-muted-foreground tabular-nums">{event.progress}%</span>
      </div>

      <div className="relative overflow-hidden rounded-full">
        <Progress value={event.progress} className={cn(failed && 'bg-destructive/20')} />
        {running && (
          <div className="trip-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        )}
      </div>

      <ol className="mt-6 grid gap-3 sm:grid-cols-5">
        {TRIP_STAGES.map((stage) => {
          const state = stageState(stage.status, event.status)
          const Icon = STAGE_ICONS[stage.status]
          return (
            <li key={stage.status} className="flex items-center gap-2">
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                {state === 'active' && (
                  <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping [animation-duration:1.6s]" />
                )}
                <span
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-500',
                    state === 'done' &&
                      'border-primary bg-primary text-primary-foreground animate-in zoom-in duration-300',
                    state === 'active' && 'border-primary bg-primary/10 text-primary',
                    state === 'idle' && 'border-border text-muted-foreground',
                  )}
                >
                  {failed && state === 'idle' ? (
                    <X className="h-3.5 w-3.5" />
                  ) : state === 'done' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : Icon ? (
                    <Icon className={cn('h-3.5 w-3.5', state === 'active' && 'trip-float')} />
                  ) : null}
                </span>
              </span>
              <span
                className={cn(
                  'text-sm transition-colors duration-300',
                  state === 'active' && 'font-medium text-primary',
                  state === 'done' && 'text-foreground',
                  state === 'idle' && 'text-muted-foreground',
                )}
              >
                {stage.label}
              </span>
            </li>
          )
        })}
      </ol>

      {running && <StageTicker status={event.status} />}

      {typeof event.crawled === 'number' && typeof event.total === 'number' && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
          {Array.from({ length: event.total }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-1.5 rounded-full transition-colors duration-300',
                i < event.crawled ? 'bg-primary' : 'bg-border',
              )}
            />
          ))}
          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
            {event.crawled} / {event.total} 篇
          </span>
        </div>
      )}

      {event.status === 'done' && (
        <p className="mt-4 text-center text-sm font-medium text-primary animate-in zoom-in fade-in duration-500">
          🎉 行程完成，往下看你的專屬旅程！
        </p>
      )}
    </div>
  )
}
