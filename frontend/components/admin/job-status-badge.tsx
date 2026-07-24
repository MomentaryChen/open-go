import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Pipeline stages in run order, plus the two terminal states. */
const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '排隊中', className: 'bg-muted text-muted-foreground' },
  planning: { label: '規劃中', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  searching: { label: '搜尋中', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  crawling: { label: '抓取中', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  composing: { label: '組合中', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  done: { label: '完成', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  failed: { label: '失敗', className: 'bg-destructive/15 text-destructive' },
}

export function JobStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status]
  return (
    <Badge
      variant="secondary"
      className={cn('font-normal', meta?.className ?? 'bg-muted text-muted-foreground')}
    >
      {meta?.label ?? status}
    </Badge>
  )
}

/** Human-readable elapsed time; jobs run from a few seconds to a few minutes. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} 秒`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} 分 ${Math.round(seconds % 60)} 秒`
}

export function formatDateTime(value: string | Date | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-TW', { hour12: false })
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}
