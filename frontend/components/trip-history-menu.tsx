'use client'

import { Check, History, Share2, X } from 'lucide-react'
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import { timeAgo, type TripHistoryEntry } from '@/lib/trip-history'

type Props = {
  entries: TripHistoryEntry[]
  /** Disables opening an entry while another run is in flight. */
  busy: boolean
  /** jobId whose share link was just copied, for the ✓ feedback. */
  copiedId: string | null
  onOpen: (entry: TripHistoryEntry) => void
  onShare: (jobId: string) => void
  onRemove: (jobId: string) => void
  onClearAll: () => void
}

/**
 * The "先前的查詢" dropdown under the search box.
 *
 * Every row is a real button, so Tab already walks the list; what was missing
 * was a way out without picking something, which Escape now provides (handled
 * by the parent form so it works from the input too).
 */
export function TripHistoryMenu({
  entries,
  busy,
  copiedId,
  onOpen,
  onShare,
  onRemove,
  onClearAll,
}: Props) {
  const { t, locale } = useLanguage()
  return (
    <div
      id="trip-history-menu"
      className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-border bg-card/95 p-3 shadow-xl shadow-primary/5 backdrop-blur animate-in fade-in slide-in-from-top-1 duration-200"
    >
      <div className="flex items-center justify-between px-1">
        <div
          id="trip-history-label"
          className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
        >
          <History className="h-3.5 w-3.5 text-primary" aria-hidden />
          {t.history.title}
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-destructive"
          onClick={onClearAll}
        >
          {t.history.clearAll}
        </button>
      </div>

      <ul className="mt-2 space-y-0.5" aria-labelledby="trip-history-label">
        {entries.map((entry) => {
          const unfinished = entry.done === false
          return (
            <li key={entry.jobId} className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpen(entry)}
                className="flex min-w-0 flex-1 items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-secondary/60 disabled:opacity-50"
              >
                <span className="truncate text-foreground">{entry.keyword}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {unfinished ? t.history.unfinished : timeAgo(entry.createdAt, locale)}
                </span>
              </button>
              <button
                type="button"
                aria-label={fmt(t.history.share, { keyword: entry.keyword })}
                title={unfinished ? t.history.shareDisabledTitle : t.history.shareTitle}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30"
                disabled={unfinished}
                onClick={() => onShare(entry.jobId)}
              >
                {copiedId === entry.jobId ? (
                  <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                ) : (
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
              <button
                type="button"
                aria-label={fmt(t.history.remove, { keyword: entry.keyword })}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(entry.jobId)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
