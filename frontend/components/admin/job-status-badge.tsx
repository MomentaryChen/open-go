'use client'

import { Badge } from '@/components/ui/badge'
import { bcp47, fmt, getClientLocale, getDictionary } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'

/** Pipeline stages in run order, plus the two terminal states. Labels resolve
 * via `t.admin.status[status]`; only the colors live here. */
const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  planning: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  searching: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  crawling: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  composing: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-destructive/15 text-destructive',
}

export function JobStatusBadge({ status }: { status: string }) {
  const { t } = useLanguage()
  const label = (t.admin.status as Record<string, string>)[status] ?? status
  return (
    <Badge
      variant="secondary"
      className={cn('font-normal', STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground')}
    >
      {label}
    </Badge>
  )
}

// The formatters below are pure functions called during client render (admin
// is entirely client-side and rows render after the data fetch), so they read
// the locale from the cookie rather than threading it through every call site.

/** Human-readable elapsed time; jobs run from a few seconds to a few minutes. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const t = getDictionary(getClientLocale()).admin.duration
  if (ms < 1000) return fmt(t.ms, { n: Math.round(ms) })
  const seconds = ms / 1000
  if (seconds < 60) return fmt(t.seconds, { n: seconds.toFixed(1) })
  const minutes = Math.floor(seconds / 60)
  return fmt(t.minutesSeconds, { m: minutes, s: Math.round(seconds % 60) })
}

export function formatDateTime(value: string | Date | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(bcp47(getClientLocale()), { hour12: false })
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}
