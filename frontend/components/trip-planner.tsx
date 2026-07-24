'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cloud,
  Compass,
  History,
  Loader2,
  Plane,
  PlugZap,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ItineraryView } from '@/components/itinerary-view'
import { LanguageToggle } from '@/components/language-toggle'
import { ShareActions } from '@/components/share-actions'
import { ThemeToggle } from '@/components/theme-toggle'
import { TripHistoryMenu } from '@/components/trip-history-menu'
import { TripPreferencesPanel } from '@/components/trip-preferences-panel'
import { TripProgress } from '@/components/trip-progress'
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import { copyText } from '@/lib/clipboard'
import {
  apiBaseUrl,
  EMPTY_TRIP_PREFERENCES,
  hasTripPreferences,
  type Itinerary,
  type TripPreferences,
  type TripProgressEvent,
  type TripStatus,
} from '@/lib/trip'
import { validateKeyword, type KeywordErrorCode } from '@/lib/keyword-validator'
import {
  addTripHistory,
  clearTripHistory,
  findResumableTrip,
  loadTripHistory,
  markTripHistoryDone,
  removeTripHistory,
  timeAgo,
  type TripHistoryEntry,
} from '@/lib/trip-history'

/** Server-rendered permalink for a finished job — shareable, with a preview card. */
function sharePath(jobId: string) {
  return `/trip/${jobId}`
}

type StoredJob = {
  keyword?: string
  status?: string
  progress?: number
  message?: string | null
  error?: string | null
  itinerary?: { data?: Itinerary } | null
}

/** Read a job's persisted state. Returns null when it is gone or unreachable. */
async function fetchJob(jobId: string): Promise<StoredJob | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/trips/${jobId}`)
    if (!response.ok) return null
    return (await response.json()) as StoredJob
  } catch {
    return null
  }
}

export function TripPlanner() {
  const { t, locale } = useLanguage()
  const [keyword, setKeyword] = useState('')
  const [keywordError, setKeywordError] = useState<KeywordErrorCode | null>(null)
  const [preferences, setPreferences] = useState<TripPreferences>(
    EMPTY_TRIP_PREFERENCES,
  )
  const [event, setEvent] = useState<TripProgressEvent | null>(null)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [history, setHistory] = useState<TripHistoryEntry[]>([])
  /** Whether the history dropdown under the search box is showing. */
  const [historyOpen, setHistoryOpen] = useState(false)
  /** jobId whose share link was just copied, for the ✓ feedback. */
  const [copiedId, setCopiedId] = useState<string | null>(null)
  /** One-off message shown instead of the progress panel (e.g. after cancelling). */
  const [notice, setNotice] = useState<string | null>(null)
  /** A previous run that never reported a result and may still be going. */
  const [resumable, setResumable] = useState<TripHistoryEntry | null>(null)
  const sourceRef = useRef<EventSource | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Job currently being tracked, so late async callbacks can tell if they are stale. */
  const activeJobRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      sourceRef.current?.close()
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    },
    [],
  )

  // localStorage is browser-only; read after mount to avoid hydration drift.
  useEffect(() => {
    setHistory(loadTripHistory())
  }, [])

  const stopStream = useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = null
  }, [])

  /** Fetch a finished job's stored result and show it (no pipeline re-run). */
  const loadStored = useCallback(async (jobId: string, note?: string) => {
    stopStream()
    activeJobRef.current = null
    setSubmitting(true)
    setItinerary(null)
    setEvent(null)
    setNotice(null)
    setFromCache(false)

    try {
      const response = await fetch(`${apiBaseUrl()}/trips/${jobId}`)
      if (!response.ok)
        throw new Error(fmt(t.tripPlanner.recordGone, { status: response.status }))
      const job = (await response.json()) as {
        keyword?: string
        itinerary?: { data?: Itinerary } | null
      }
      if (!job.itinerary?.data) throw new Error(t.tripPlanner.recordNoItinerary)

      if (job.keyword) setKeyword(job.keyword)
      setEvent({
        jobId,
        status: 'done',
        progress: 100,
        message: note ?? t.tripPlanner.loadedPrevious,
      })
      setItinerary(job.itinerary.data)
      setFromCache(true)
      // Keep the address bar shareable: copying it reopens this exact result.
      window.history.replaceState(null, '', sharePath(jobId))
      return true
    } catch (error) {
      setEvent({
        jobId: '',
        status: 'failed',
        progress: 100,
        error: (error as Error).message,
      })
      return false
    } finally {
      setSubmitting(false)
    }
  }, [])

  /** Show a finished itinerary and settle all the bookkeeping that goes with it. */
  const settleDone = useCallback(
    (jobId: string, data: Itinerary, message: string) => {
      setItinerary(data)
      setEvent({ jobId, status: 'done', progress: 100, message })
      setHistory(markTripHistoryDone(jobId))
      window.history.replaceState(null, '', sharePath(jobId))
    },
    [],
  )

  /**
   * The stream died for good. The pipeline runs server-side, so it may well
   * have finished in the meantime — ask before declaring anything failed.
   */
  const recoverFromDrop = useCallback(
    async (jobId: string) => {
      const job = await fetchJob(jobId)
      if (activeJobRef.current !== jobId) return // user started something else

      if (job?.itinerary?.data) {
        settleDone(jobId, job.itinerary.data, t.tripPlanner.recoveredAfterDrop)
        return
      }
      setEvent({
        jobId,
        status: 'failed',
        progress: 100,
        error:
          job === null
            ? t.tripPlanner.connectionLost
            : t.tripPlanner.connectionLostResumable,
      })
    },
    [settleDone],
  )

  /** Subscribe to a job's progress stream. Used for both new and resumed runs. */
  const attachStream = useCallback(
    (jobId: string) => {
      stopStream()
      activeJobRef.current = jobId

      const source = new EventSource(`${apiBaseUrl()}/trips/${jobId}/stream`)
      sourceRef.current = source

      source.onmessage = (message) => {
        const payload = JSON.parse(message.data) as TripProgressEvent
        setEvent(payload)
        if (payload.itinerary) setItinerary(payload.itinerary)
        if (payload.status === 'done') {
          setHistory(markTripHistoryDone(jobId))
          window.history.replaceState(null, '', sharePath(jobId))
        }
        if (payload.status === 'failed' || payload.status === 'cancelled') {
          setHistory(markTripHistoryDone(jobId))
        }
        if (
          payload.status === 'done' ||
          payload.status === 'failed' ||
          payload.status === 'cancelled'
        ) {
          stopStream()
        }
      }

      source.onerror = () => {
        // EventSource reconnects on its own; only a CLOSED socket is terminal.
        // Killing it on the first blip is what used to throw away a run that
        // the backend was still happily working on.
        if (source.readyState !== EventSource.CLOSED) {
          setEvent((current) =>
            current &&
            current.status !== 'done' &&
            current.status !== 'failed' &&
            current.status !== 'cancelled'
              ? { ...current, message: t.tripPlanner.reconnecting }
              : current,
          )
          return
        }
        stopStream()
        void recoverFromDrop(jobId)
      }
    },
    [recoverFromDrop, stopStream],
  )

  /** Stop watching a run. The backend keeps going; the entry stays resumable. */
  const cancel = useCallback(() => {
    stopStream()
    activeJobRef.current = null
    setEvent(null)
    setNotice(t.tripPlanner.cancelledNotice)
  }, [stopStream])

  /** Reattach to a query that was still running when the page was left. */
  const resume = useCallback(
    async (entry: TripHistoryEntry) => {
      setResumable(null)
      setHistoryOpen(false)
      setNotice(null)
      setItinerary(null)
      setEvent(null)
      setFromCache(false)
      setKeyword(entry.keyword)

      const job = await fetchJob(entry.jobId)
      if (!job) {
        setHistory(removeTripHistory(entry.jobId))
        setEvent({
          jobId: '',
          status: 'failed',
          progress: 100,
          error: t.tripPlanner.recordGoneShort,
        })
        return
      }

      if (job.itinerary?.data) {
        settleDone(entry.jobId, job.itinerary.data, t.tripPlanner.loadedPrevious)
        return
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        setHistory(markTripHistoryDone(entry.jobId))
        setEvent({
          jobId: entry.jobId,
          status: job.status === 'cancelled' ? 'cancelled' : 'failed',
          progress: 100,
          error: job.error ?? t.tripPlanner.planFailed,
        })
        return
      }

      setEvent({
        jobId: entry.jobId,
        status: (job.status as TripStatus) ?? 'pending',
        progress: job.progress ?? 0,
        message: t.tripPlanner.reconnectedPrevious,
      })
      attachStream(entry.jobId)
    },
    [attachStream, settleDone],
  )

  // A shared link (/?job=...) opens that stored result directly. Otherwise,
  // surface the last run that never reported back so it can be picked up.
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get('job')
    if (jobId) {
      void loadStored(jobId, t.tripPlanner.loadedShared)
      return
    }
    setResumable(findResumableTrip())
  }, [loadStored])

  const copyShareLink = useCallback(async (jobId: string) => {
    // /trip/<id> is server-rendered, so chat apps get a real preview card.
    await copyText(`${window.location.origin}${sharePath(jobId)}`)
    setCopiedId(jobId)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const start = useCallback(
    async (value: string, forceRefresh = false) => {
      const trimmed = value.trim()
      if (!trimmed) return

      setHistoryOpen(false)
      stopStream()
      activeJobRef.current = null
      setSubmitting(true)
      setItinerary(null)
      setEvent(null)
      setNotice(null)
      setResumable(null)
      setFromCache(false)
      // Drop the previous trip's permalink so a refresh mid-run does not reopen it.
      window.history.replaceState(null, '', '/')

      try {
        const response = await fetch(`${apiBaseUrl()}/trips`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: trimmed,
            forceRefresh,
            // Only sent when the traveller pinned something down; an empty
            // panel keeps the pipeline's keyword-based inference.
            ...(hasTripPreferences(preferences) ? { preferences } : {}),
          }),
        })
        if (!response.ok)
          throw new Error(fmt(t.tripPlanner.createJobFailed, { status: response.status }))

        const { jobId, cached } = (await response.json()) as {
          jobId: string
          cached?: boolean
        }

        if (cached) {
          // The job already finished, so its SSE stream will never emit; read
          // the stored result directly.
          const job = await fetchJob(jobId)
          if (!job?.itinerary?.data) throw new Error(t.tripPlanner.readCacheFailed)
          setItinerary(job.itinerary.data)
          setEvent({
            jobId,
            status: 'done',
            progress: 100,
            message: t.tripPlanner.appliedCache,
          })
          setFromCache(true)
          setHistory(addTripHistory({ jobId, keyword: trimmed, done: true }))
          window.history.replaceState(null, '', sharePath(jobId))
          return
        }

        // Recorded before the first event arrives: if the tab is closed or
        // refreshed mid-run, this entry is what makes the job findable again.
        setHistory(addTripHistory({ jobId, keyword: trimmed, done: false }))
        setEvent({ jobId, status: 'pending', progress: 0, message: t.tripPlanner.queued })
        attachStream(jobId)
      } catch (error) {
        setEvent({
          jobId: '',
          status: 'failed',
          progress: 100,
          error: (error as Error).message,
        })
      } finally {
        setSubmitting(false)
      }
    },
    [attachStream, preferences, stopStream],
  )

  /**
   * Open a previous query. Finished ones just read back their stored result;
   * one that never reported back reattaches to its still-running stream.
   */
  const openHistory = useCallback(
    async (entry: TripHistoryEntry) => {
      if (entry.done === false) {
        await resume(entry)
        return
      }
      setHistoryOpen(false)
      setKeyword(entry.keyword)
      const ok = await loadStored(
        entry.jobId,
        fmt(t.tripPlanner.loadedPreviousAt, { ago: timeAgo(entry.createdAt, locale) }),
      )
      // The backend no longer has this job — drop the dead entry.
      if (!ok) setHistory(removeTripHistory(entry.jobId))
    },
    [loadStored, resume],
  )

  const running =
    event !== null &&
    event.status !== 'done' &&
    event.status !== 'failed' &&
    event.status !== 'cancelled'
  const showHistoryMenu = historyOpen && history.length > 0

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Decorative travel backdrop: static blurred blobs + drifting clouds +
          an animated dashed flight path. All transform/opacity — stays smooth. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-40 top-48 h-[28rem] w-[28rem] rounded-full bg-accent/15 blur-3xl" />
        <Cloud className="trip-drift absolute left-[8%] top-24 h-10 w-10 text-primary/15" />
        <Cloud className="trip-drift absolute right-[12%] top-14 h-14 w-14 text-primary/10 [animation-delay:1.8s]" />
        <Cloud className="trip-drift absolute left-[22%] top-52 h-8 w-8 text-accent/15 [animation-delay:3s]" />
        <svg
          className="absolute inset-x-0 top-8 mx-auto w-full max-w-3xl text-primary/25"
          viewBox="0 0 600 130"
          fill="none"
        >
          <path
            d="M24 108 C 170 14, 430 14, 566 96"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="6 8"
            strokeLinecap="round"
            className="trip-dash"
          />
        </svg>
        <Plane className="trip-float absolute right-[8%] top-9 h-7 w-7 -rotate-12 text-primary/50" />
      </div>

      <div className="container relative mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-center justify-between">
          <a
            href="/explore"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-card/70 px-3.5 py-1.5 text-sm font-medium text-primary shadow-sm backdrop-blur transition-colors hover:border-primary/40"
          >
            <Compass className="h-3.5 w-3.5" />
            {t.nav.explore}
          </a>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-4 py-2 text-primary shadow-sm backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">{t.tripPlanner.badge}</span>
          </div>
          <h1 className="mt-5 text-balance text-4xl font-bold md:text-5xl animate-in fade-in slide-in-from-bottom-3 duration-700">
            <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
              {t.tripPlanner.titleLead}
            </span>
            <br className="md:hidden" />
            <span className="text-foreground">{t.tripPlanner.titleRest}</span>
          </h1>
          <p className="mt-4 text-pretty text-muted-foreground animate-in fade-in slide-in-from-bottom-3 duration-700 [animation-delay:120ms] [animation-fill-mode:backwards]">
            {t.tripPlanner.subtitle}
          </p>
        </div>

        <form
          className="relative mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700 [animation-delay:200ms] [animation-fill-mode:backwards]"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            void start(keyword)
          }}
          // Focus-within tracking: the dropdown stays open while focus is on
          // the input or any button inside it, and closes when focus leaves.
          onFocus={() => setHistoryOpen(true)}
          onBlur={(focusEvent) => {
            if (!focusEvent.currentTarget.contains(focusEvent.relatedTarget)) {
              setHistoryOpen(false)
            }
          }}
          // Escape dismisses the dropdown without choosing anything — the one
          // keyboard exit the focus-within pattern does not give you for free.
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === 'Escape' && historyOpen) {
              keyEvent.preventDefault()
              setHistoryOpen(false)
            }
          }}
        >
          <div className="flex gap-2 rounded-2xl border border-border bg-card/80 p-2 shadow-lg shadow-primary/5 backdrop-blur transition-shadow focus-within:shadow-xl focus-within:shadow-primary/10">
            <Input
              value={keyword}
              onChange={(inputEvent) => {
                const value = inputEvent.target.value
                setKeyword(value)
                setKeywordError(validateKeyword(value))
                setHistoryOpen(true)
              }}
              // Escape closes the dropdown without moving focus, so onFocus
              // will not fire again — clicking or typing has to reopen it.
              onClick={() => setHistoryOpen(true)}
              placeholder={t.tripPlanner.placeholder}
              aria-label={t.tripPlanner.keywordAria}
              aria-expanded={showHistoryMenu}
              aria-controls={showHistoryMenu ? 'trip-history-menu' : undefined}
              className="h-12 border-none bg-transparent text-lg shadow-none focus-visible:ring-0"
              disabled={running || submitting}
            />
            <Button
              type="submit"
              size="lg"
              className="h-12 shrink-0 rounded-xl px-6 transition-transform active:scale-95"
              disabled={!keyword.trim() || !!keywordError || running || submitting}
            >
              {running || submitting ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-5 w-5" />
              )}
              {running ? t.tripPlanner.planning : t.tripPlanner.depart}
            </Button>
          </div>

          {keywordError && (
            <p className="mt-1.5 px-2 text-sm text-destructive" role="alert">
              {t.tripPlanner.keywordError[keywordError]}
            </p>
          )}

          {/* History dropdown: appears under the search box while it has focus. */}
          {showHistoryMenu && (
            <TripHistoryMenu
              entries={history}
              busy={running || submitting}
              copiedId={copiedId}
              onOpen={(entry) => void openHistory(entry)}
              onShare={(jobId) => void copyShareLink(jobId)}
              onRemove={(jobId) => setHistory(removeTripHistory(jobId))}
              onClearAll={() => setHistory(clearTripHistory())}
            />
          )}
        </form>

        <TripPreferencesPanel
          value={preferences}
          onChange={setPreferences}
          disabled={running || submitting}
        />

        <div className="mt-5 flex flex-wrap justify-center gap-2 animate-in fade-in duration-700 [animation-delay:300ms] [animation-fill-mode:backwards]">
          {t.tripPlanner.examples.map((example) => (
            <button
              key={example.label}
              type="button"
              disabled={running || submitting}
              onClick={() => {
                setKeyword(example.label)
                setKeywordError(null)
                void start(example.label)
              }}
              className="trip-lift rounded-full border border-border bg-card/70 px-4 py-2 text-sm text-secondary-foreground shadow-sm backdrop-blur hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              <span className="mr-1.5">{example.emoji}</span>
              {example.label}
            </button>
          ))}
        </div>

        {/* A run from a previous visit that never reported a result. Offered
            rather than resumed automatically, so reloading never surprises. */}
        {resumable && !event && (
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
            <span className="flex items-center gap-2 text-foreground">
              <PlugZap className="h-4 w-4 shrink-0 text-primary" />
              {fmt(t.tripPlanner.resumableRunning, { keyword: resumable.keyword })}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={submitting}
                onClick={() => void resume(resumable)}
              >
                {t.tripPlanner.resume}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHistory(removeTripHistory(resumable.jobId))
                  setResumable(null)
                }}
              >
                {t.tripPlanner.ignore}
              </Button>
            </div>
          </div>
        )}

        {notice && (
          <div className="mt-10 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-500">
            {notice}
          </div>
        )}

        {event && (
          <div className="mt-10">
            <TripProgress event={event} />
          </div>
        )}

        {running && event?.jobId && (
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              <X className="mr-1.5 h-4 w-4" />
              {t.tripPlanner.stopTracking}
            </Button>
          </div>
        )}

        {event?.status === 'failed' && keyword.trim() && (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => void start(keyword, true)}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t.tripPlanner.retry}
            </Button>
          </div>
        )}

        {fromCache && itinerary && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-500">
            <span>{t.tripPlanner.fromCacheNote}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={running || submitting}
              onClick={() => void start(keyword, true)}
            >
              {t.tripPlanner.regenerate}
            </Button>
          </div>
        )}

        {itinerary && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {event?.jobId && (
              <div className="mb-3 flex justify-end">
                <ShareActions
                  jobId={event.jobId}
                  title={itinerary.title}
                  path={sharePath(event.jobId)}
                />
              </div>
            )}
            <ItineraryView itinerary={itinerary} jobId={event?.jobId} />
          </div>
        )}
      </div>
    </main>
  )
}
