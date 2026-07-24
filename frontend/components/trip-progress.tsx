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
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import { TRIP_STAGE_ORDER, type TripProgressEvent, type TripStatus } from '@/lib/trip'

const STAGE_ORDER: TripStatus[] = ['pending', 'planning', 'searching', 'crawling', 'composing', 'done']

const STAGE_ICONS: Partial<Record<TripStatus, LucideIcon>> = {
  planning: BrainCircuit,
  searching: Search,
  crawling: FileText,
  composing: Wand2,
  done: PartyPopper,
}

function stageState(stage: TripStatus, current: TripStatus) {
  if (current === 'failed' || current === 'cancelled') return 'idle'
  const currentIndex = STAGE_ORDER.indexOf(current)
  const stageIndex = STAGE_ORDER.indexOf(stage)
  if (currentIndex > stageIndex) return 'done'
  if (currentIndex === stageIndex) return current === 'done' ? 'done' : 'active'
  return 'idle'
}

function StageTicker({ status }: { status: TripStatus }) {
  const { t } = useLanguage()
  const messages = (
    t.tripProgress.ticker as Partial<Record<TripStatus, string[]>>
  )[status]
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
  const { t } = useLanguage()
  const failed = event.status === 'failed' || event.status === 'cancelled'
  const running = !failed && event.status !== 'done'

  return (
    <div className="rounded-2xl border border-border bg-card p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/*
        The pipeline runs for minutes with no visual cue a screen reader can
        follow, so the essentials are mirrored into one polite live region.
        Deliberately not wrapping the whole panel: the rotating ticker and the
        five stage chips re-render constantly and would announce non-stop.
      */}
      <p className="sr-only" role="status" aria-live="polite">
        {failed
          ? fmt(t.tripProgress.failedLive, { error: event.error ?? t.common.unknownError })
          : event.status === 'done'
            ? t.tripProgress.doneLive
            : fmt(t.tripProgress.progressLive, {
                message: event.message ?? t.tripProgress.processingShort,
                progress: event.progress,
              })}
      </p>

      <div className="flex items-center justify-between mb-3">
        <p className={cn('text-sm font-medium', failed ? 'text-destructive' : 'text-foreground')}>
          {failed ? (event.error ?? t.tripProgress.failed) : (event.message ?? t.tripProgress.processing)}
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
        {TRIP_STAGE_ORDER.map((status) => {
          const state = stageState(status, event.status)
          const Icon = STAGE_ICONS[status]
          return (
            <li key={status} className="flex items-center gap-2">
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
                {t.tripStages[status]}
              </span>
            </li>
          )
        })}
      </ol>

      {/* Flavour text on a 2.8s rotation — noise for anyone listening. */}
      {running && (
        <div aria-hidden>
          <StageTicker status={event.status} />
        </div>
      )}

      {typeof event.crawled === 'number' && typeof event.total === 'number' && (
        <CrawlDots crawled={event.crawled} total={event.total} />
      )}

      {event.status === 'done' && (
        <p className="mt-4 text-center text-sm font-medium text-primary animate-in zoom-in fade-in duration-500">
          {t.tripProgress.doneCheer}
        </p>
      )}
    </div>
  )
}

/**
 * The dot row is decorative: `total` comes straight off the wire, so it is
 * capped before being turned into DOM nodes rather than trusting the server
 * not to send something absurd. The "n / m 篇" text carries the real meaning.
 */
const MAX_DOTS = 40

/**
 * One dot per document being crawled, filled as each one lands. Taking the
 * counts as props rather than reading them off `event` inline keeps the
 * "is a number" narrowing alive inside the map callback.
 */
function CrawlDots({ crawled, total }: { crawled: number; total: number }) {
  const { t } = useLanguage()
  const shown = Math.min(Math.max(total, 0), MAX_DOTS)
  // Keep the fill proportional when the real total exceeds what is drawn.
  const filled = total > 0 ? Math.round((crawled / total) * shown) : 0

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
      <span aria-hidden className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: shown }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors duration-300',
              i < filled ? 'bg-primary' : 'bg-border',
            )}
          />
        ))}
      </span>
      <span className="ml-2 text-xs text-muted-foreground tabular-nums">
        {fmt(t.tripProgress.crawlDots, { crawled, total })}
      </span>
    </div>
  )
}
