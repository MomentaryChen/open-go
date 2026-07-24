'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Cloud,
  History,
  Loader2,
  Plane,
  Share2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ItineraryView } from '@/components/itinerary-view'
import { TripProgress } from '@/components/trip-progress'
import { apiBaseUrl, type Itinerary, type TripProgressEvent } from '@/lib/trip'
import {
  addTripHistory,
  clearTripHistory,
  loadTripHistory,
  removeTripHistory,
  timeAgo,
  type TripHistoryEntry,
} from '@/lib/trip-history'

const EXAMPLES = [
  { emoji: '🎡', label: '大阪三天兩夜親子自由行' },
  { emoji: '🍁', label: '京都賞楓五日深度旅遊' },
  { emoji: '🍜', label: '台南美食兩天一夜' },
  { emoji: '🛍️', label: 'Seoul 4 days shopping trip' },
]

export function TripPlanner() {
  const [keyword, setKeyword] = useState('')
  const [event, setEvent] = useState<TripProgressEvent | null>(null)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fromCache, setFromCache] = useState(false)
  const [history, setHistory] = useState<TripHistoryEntry[]>([])
  /** Whether the history dropdown under the search box is showing. */
  const [historyOpen, setHistoryOpen] = useState(false)
  /** jobId whose share link was just copied, for the ✓ feedback. */
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const sourceRef = useRef<EventSource | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  /** Fetch a finished job's stored result and show it (no pipeline re-run). */
  const loadStored = useCallback(async (jobId: string, note?: string) => {
    sourceRef.current?.close()
    setSubmitting(true)
    setItinerary(null)
    setEvent(null)
    setFromCache(false)

    try {
      const response = await fetch(`${apiBaseUrl()}/trips/${jobId}`)
      if (!response.ok) throw new Error(`此紀錄已不存在 (${response.status})`)
      const job = (await response.json()) as {
        keyword?: string
        itinerary?: { data?: Itinerary } | null
      }
      if (!job.itinerary?.data) throw new Error('此紀錄沒有可顯示的行程')

      if (job.keyword) setKeyword(job.keyword)
      setEvent({
        jobId,
        status: 'done',
        progress: 100,
        message: note ?? '已載入先前的查詢結果',
      })
      setItinerary(job.itinerary.data)
      setFromCache(true)
      // Keep the address bar shareable: copying it reopens this exact result.
      window.history.replaceState(null, '', `/?job=${jobId}`)
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

  // A shared link (/?job=...) opens that stored result directly.
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get('job')
    if (jobId) void loadStored(jobId, '已載入分享的行程')
  }, [loadStored])

  const copyShareLink = useCallback(async (jobId: string) => {
    const url = `${window.location.origin}/?job=${jobId}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard API blocked (e.g. plain-http origin) — legacy fallback.
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setCopiedId(jobId)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const start = useCallback(async (value: string, forceRefresh = false) => {
    const trimmed = value.trim()
    if (!trimmed) return

    setHistoryOpen(false)
    sourceRef.current?.close()
    setSubmitting(true)
    setItinerary(null)
    setEvent(null)
    setFromCache(false)

    try {
      const response = await fetch(`${apiBaseUrl()}/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: trimmed, forceRefresh }),
      })
      if (!response.ok) throw new Error(`建立任務失敗 (${response.status})`)

      const { jobId, cached } = (await response.json()) as {
        jobId: string
        cached?: boolean
      }

      if (cached) {
        // The job already finished, so its SSE stream will never emit; read the
        // stored result directly.
        const jobResponse = await fetch(`${apiBaseUrl()}/trips/${jobId}`)
        if (!jobResponse.ok) throw new Error(`讀取快取結果失敗 (${jobResponse.status})`)
        const job = (await jobResponse.json()) as {
          itinerary?: { data?: Itinerary } | null
        }
        setEvent({
          jobId,
          status: 'done',
          progress: 100,
          message: '已套用先前相同關鍵字的結果（快取）',
        })
        if (job.itinerary?.data) setItinerary(job.itinerary.data)
        setFromCache(true)
        setHistory(addTripHistory({ jobId, keyword: trimmed }))
        window.history.replaceState(null, '', `/?job=${jobId}`)
        return
      }

      setEvent({ jobId, status: 'pending', progress: 0, message: '已排入佇列' })

      const source = new EventSource(`${apiBaseUrl()}/trips/${jobId}/stream`)
      sourceRef.current = source

      source.onmessage = (message) => {
        const payload = JSON.parse(message.data) as TripProgressEvent
        setEvent(payload)
        if (payload.itinerary) setItinerary(payload.itinerary)
        if (payload.status === 'done') {
          setHistory(addTripHistory({ jobId, keyword: trimmed }))
          window.history.replaceState(null, '', `/?job=${jobId}`)
        }
        if (payload.status === 'done' || payload.status === 'failed') source.close()
      }

      source.onerror = () => {
        source.close()
        setEvent((current) =>
          current && current.status !== 'done'
            ? { ...current, status: 'failed', error: '與伺服器的連線中斷' }
            : current,
        )
      }
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
  }, [])

  /** Show a previous query's stored result without re-running the pipeline. */
  const openHistory = useCallback(
    async (entry: TripHistoryEntry) => {
      setHistoryOpen(false)
      setKeyword(entry.keyword)
      const ok = await loadStored(
        entry.jobId,
        `已載入先前的查詢結果（${timeAgo(entry.createdAt)}）`,
      )
      // The backend no longer has this job — drop the dead entry.
      if (!ok) setHistory(removeTripHistory(entry.jobId))
    },
    [loadStored],
  )

  const running = event !== null && event.status !== 'done' && event.status !== 'failed'

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
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-4 py-2 text-primary shadow-sm backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">AI 行程規劃</span>
          </div>
          <h1 className="mt-5 text-balance text-4xl font-bold md:text-5xl animate-in fade-in slide-in-from-bottom-3 duration-700">
            <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
              給我一個目的地，
            </span>
            <br className="md:hidden" />
            <span className="text-foreground">帶你飛向完整行程</span>
          </h1>
          <p className="mt-4 text-pretty text-muted-foreground animate-in fade-in slide-in-from-bottom-3 duration-700 [animation-delay:120ms] [animation-fill-mode:backwards]">
            輸入關鍵字，AI 讀遍 30 篇旅遊文章，為你排出逐日可執行的旅程 ✈️
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
        >
          <div className="flex gap-2 rounded-2xl border border-border bg-card/80 p-2 shadow-lg shadow-primary/5 backdrop-blur transition-shadow focus-within:shadow-xl focus-within:shadow-primary/10">
            <Input
              value={keyword}
              onChange={(inputEvent) => setKeyword(inputEvent.target.value)}
              placeholder="例如：大阪三天兩夜親子自由行"
              className="h-12 border-none bg-transparent text-lg shadow-none focus-visible:ring-0"
              disabled={running || submitting}
            />
            <Button
              type="submit"
              size="lg"
              className="h-12 shrink-0 rounded-xl px-6 transition-transform active:scale-95"
              disabled={!keyword.trim() || running || submitting}
            >
              {running || submitting ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-5 w-5" />
              )}
              {running ? '規劃中…' : '出發'}
            </Button>
          </div>

          {/* History dropdown: appears under the search box while it has focus. */}
          {historyOpen && history.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-border bg-card/95 p-3 shadow-xl shadow-primary/5 backdrop-blur animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <History className="h-3.5 w-3.5 text-primary" />
                  先前的查詢
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setHistory(clearTripHistory())}
                >
                  清除全部
                </button>
              </div>
              <ul className="mt-2 space-y-0.5">
                {history.map((entry) => (
                  <li key={entry.jobId} className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={running || submitting}
                      onClick={() => void openHistory(entry)}
                      className="flex min-w-0 flex-1 items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary/60 disabled:opacity-50"
                    >
                      <span className="truncate text-foreground">{entry.keyword}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(entry.createdAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`分享 ${entry.keyword}`}
                      title="複製分享連結"
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-primary"
                      onClick={() => void copyShareLink(entry.jobId)}
                    >
                      {copiedId === entry.jobId ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`移除 ${entry.keyword}`}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                      onClick={() => setHistory(removeTripHistory(entry.jobId))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>

        <div className="mt-5 flex flex-wrap justify-center gap-2 animate-in fade-in duration-700 [animation-delay:300ms] [animation-fill-mode:backwards]">
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              disabled={running || submitting}
              onClick={() => {
                setKeyword(example.label)
                void start(example.label)
              }}
              className="trip-lift rounded-full border border-border bg-card/70 px-4 py-2 text-sm text-secondary-foreground shadow-sm backdrop-blur hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              <span className="mr-1.5">{example.emoji}</span>
              {example.label}
            </button>
          ))}
        </div>

        {event && (
          <div className="mt-10">
            <TripProgress event={event} />
          </div>
        )}

        {fromCache && itinerary && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-500">
            <span>此行程來自先前相同關鍵字的結果。</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={running || submitting}
              onClick={() => void start(keyword, true)}
            >
              重新產生
            </Button>
          </div>
        )}

        {itinerary && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {event?.jobId && (
              <div className="mb-3 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyShareLink(event.jobId)}
                >
                  {copiedId === event.jobId ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4" />
                      已複製連結
                    </>
                  ) : (
                    <>
                      <Share2 className="mr-1.5 h-4 w-4" />
                      分享行程
                    </>
                  )}
                </Button>
              </div>
            )}
            <ItineraryView itinerary={itinerary} />
          </div>
        )}
      </div>
    </main>
  )
}
