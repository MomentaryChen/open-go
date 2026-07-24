'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  batchDeleteJobs,
  batchRetryJobs,
  deleteJob,
  failStuckJobs,
  getJobStats,
  listJobs,
  retryJob,
  type JobStats,
  type JobSummary,
} from '@/lib/admin'
import {
  JobStatusBadge,
  formatDateTime,
  formatDuration,
  formatPercent,
} from '@/components/admin/job-status-badge'
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'

const PAGE_SIZE = 20
const STATUS_OPTIONS = ['all', 'active', 'done', 'failed', 'pending'] as const

/** Auto-refresh cadence while any job is still running. */
const LIVE_REFRESH_MS = 5000

// useSearchParams needs a Suspense boundary during prerender.
export default function AdminJobsPage() {
  const { t } = useLanguage()
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">{t.common.loading}</p>}>
      <JobsPageContent />
    </Suspense>
  )
}

function JobsPageContent() {
  const { t } = useLanguage()
  // Deep links from the keyword analytics page pre-fill the filter.
  const searchParams = useSearchParams()
  const initialKeyword = searchParams.get('keyword') ?? ''
  const statusParam = searchParams.get('status') ?? 'all'
  const initialStatus = (STATUS_OPTIONS as readonly string[]).includes(statusParam)
    ? statusParam
    : 'all'

  const [items, setItems] = useState<JobSummary[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<JobStats | null>(null)
  const [loading, setLoading] = useState(true)

  const [status, setStatus] = useState(initialStatus)
  const [keywordInput, setKeywordInput] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [page, setPage] = useState(1)

  const [deleteTarget, setDeleteTarget] = useState<JobSummary | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [batchAction, setBatchAction] = useState<'retry' | 'delete' | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)

  const hasFilter = status !== 'all' || Boolean(keyword)
  const batchCount = Math.min(total, 100)

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true)
      try {
        const [list, jobStats] = await Promise.all([
          listJobs({
            status: status === 'all' ? undefined : status,
            keyword: keyword || undefined,
            page,
            pageSize: PAGE_SIZE,
          }),
          getJobStats(),
        ])
        setItems(list.items)
        setTotal(list.total)
        setStats(jobStats)
      } catch (error) {
        if (!options?.silent) toast.error((error as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [status, keyword, page],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Jobs progress in the background, so keep polling while any is unfinished
  // or still waiting for a slot.
  useEffect(() => {
    if (!stats?.active && !stats?.queue.queued) return
    const timer = setInterval(() => void refresh({ silent: true }), LIVE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [stats?.active, stats?.queue.queued, refresh])

  const handleSearch = () => {
    setPage(1)
    setKeyword(keywordInput.trim())
  }

  const handleRetry = async (job: JobSummary) => {
    setBusyId(job.id)
    try {
      const result = await retryJob(job.id)
      toast.success(fmt(t.admin.jobs.retried, { keyword: job.keyword }), {
        description: fmt(t.admin.jobs.retriedDesc, { jobId: result.jobId }),
      })
      await refresh({ silent: true })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteJob(deleteTarget.id)
      toast.success(fmt(t.admin.jobs.deleted, { id: deleteTarget.id }))
      setDeleteTarget(null)
      await refresh({ silent: true })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const handleFailStuck = async () => {
    if (!stats) return
    try {
      const result = await failStuckJobs(stats.stuckAfterMinutes)
      toast.success(fmt(t.admin.jobs.markedFailed, { n: result.updated }))
      await refresh({ silent: true })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const currentFilter = () => ({
    status: status === 'all' ? undefined : status,
    keyword: keyword || undefined,
  })

  const handleBatchConfirm = async () => {
    if (!batchAction || !hasFilter) return
    setBatchBusy(true)
    try {
      if (batchAction === 'retry') {
        const result = await batchRetryJobs(currentFilter())
        toast.success(
          result.truncated
            ? fmt(t.admin.jobs.batchRetriedTruncated, {
                n: result.retried,
                matched: result.matched,
                limit: result.limit,
              })
            : fmt(t.admin.jobs.batchRetried, { n: result.retried }),
        )
      } else {
        const result = await batchDeleteJobs(currentFilter())
        toast.success(
          result.truncated
            ? fmt(t.admin.jobs.batchDeletedTruncated, {
                n: result.deleted,
                matched: result.matched,
                limit: result.limit,
              })
            : fmt(t.admin.jobs.batchDeleted, { n: result.deleted }),
        )
      }
      setBatchAction(null)
      await refresh({ silent: true })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setBatchBusy(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.jobs.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.jobs.subtitle}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
          {t.common.refresh}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.admin.jobs.stat.running}
          value={stats ? String(stats.queue.running) : '—'}
          hint={stats ? fmt(t.admin.jobs.queueHint, { n: stats.queue.queued }) : undefined}
        />
        <StatCard
          label={t.admin.jobs.stat.successRate}
          value={stats ? formatPercent(stats.last24h.successRate) : '—'}
          hint={
            stats
              ? fmt(t.admin.jobs.last24hHint, {
                  done: stats.last24h.done,
                  failed: stats.last24h.failed,
                })
              : undefined
          }
        />
        <StatCard
          label={t.admin.jobs.stat.avgDuration}
          value={
            stats?.last24h.avgDurationMs
              ? formatDuration(stats.last24h.avgDurationMs)
              : '—'
          }
          hint={
            stats?.last24h.p95DurationMs
              ? fmt(t.admin.jobs.p95Hint, { value: formatDuration(stats.last24h.p95DurationMs) })
              : undefined
          }
        />
        <StatCard label={t.admin.jobs.stat.total} value={stats ? String(stats.total) : '—'} />
      </div>

      {/* Jobs run in-process, so a restart strands them mid-pipeline forever. */}
      {stats && stats.stuck > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>
              {fmt(t.admin.jobs.stuckBanner, {
                count: stats.stuck,
                minutes: stats.stuckAfterMinutes,
              })}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleFailStuck()}>
            {t.admin.jobs.markAllFailed}
          </Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(value) => {
            setPage(1)
            setStatus(value)
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {t.admin.jobs.statusOptions[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-1 gap-2 sm:max-w-xs">
          <Input
            value={keywordInput}
            placeholder={t.admin.jobs.searchPlaceholder}
            onChange={(event) => setKeywordInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
          />
          <Button variant="outline" size="icon" onClick={handleSearch} aria-label={t.admin.jobs.searchAria}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        {hasFilter && total > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={batchBusy}
              onClick={() => setBatchAction('retry')}
            >
              <RotateCw className="h-4 w-4" />
              {fmt(t.admin.jobs.batchRetry, { n: batchCount })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={batchBusy}
              onClick={() => setBatchAction('delete')}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
              {fmt(t.admin.jobs.batchDelete, { n: batchCount })}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.admin.jobs.col.keyword}</TableHead>
              <TableHead className="w-28">{t.admin.jobs.col.status}</TableHead>
              <TableHead className="w-20 text-right">{t.admin.jobs.col.progress}</TableHead>
              <TableHead className="hidden w-24 text-right md:table-cell">{t.admin.jobs.col.documents}</TableHead>
              <TableHead className="hidden w-28 text-right lg:table-cell">{t.admin.jobs.col.duration}</TableHead>
              <TableHead className="hidden w-40 lg:table-cell">{t.admin.jobs.col.createdAt}</TableHead>
              <TableHead className="w-24 text-right">{t.admin.jobs.col.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t.common.loading}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t.admin.jobs.empty}
                </TableCell>
              </TableRow>
            ) : (
              items.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="max-w-64">
                    <Link
                      href={`/admin/jobs/${job.id}`}
                      className="font-medium hover:underline"
                    >
                      {job.keyword}
                    </Link>
                    {job.error && (
                      <p className="mt-0.5 truncate text-xs text-destructive">
                        {job.error}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {job.progress}%
                  </TableCell>
                  <TableCell className="hidden text-right text-sm tabular-nums md:table-cell">
                    {job.documentCount}
                  </TableCell>
                  <TableCell className="hidden text-right text-sm tabular-nums lg:table-cell">
                    {formatDuration(job.durationMs)}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {formatDateTime(job.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === job.id}
                      onClick={() => void handleRetry(job)}
                      aria-label={fmt(t.admin.jobs.retryAria, { keyword: job.keyword })}
                      title={t.admin.jobs.retry}
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(job)}
                      aria-label={fmt(t.admin.jobs.deleteAria, { keyword: job.keyword })}
                      title={t.common.delete}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {fmt(t.admin.jobs.pagination, { total, page, totalPages })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((prev) => prev - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            {t.common.prev}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => prev + 1)}
          >
            {t.common.next}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {fmt(t.admin.jobs.deleteTitle, { keyword: deleteTarget?.keyword ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.admin.jobs.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>{t.common.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!batchAction}
        onOpenChange={(open) => !open && !batchBusy && setBatchAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchAction === 'retry'
                ? fmt(t.admin.jobs.batchRetryTitle, { n: batchCount })
                : fmt(t.admin.jobs.batchDeleteTitle, { n: batchCount })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {batchAction === 'retry'
                ? t.admin.jobs.batchRetryDescription
                : t.admin.jobs.batchDeleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchBusy}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchBusy}
              onClick={(event) => {
                event.preventDefault()
                void handleBatchConfirm()
              }}
            >
              {batchAction === 'retry' ? t.admin.jobs.retry : t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}
