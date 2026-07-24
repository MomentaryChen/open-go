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

const PAGE_SIZE = 20
const STATUS_OPTIONS = [
  { value: 'all', label: '全部狀態' },
  { value: 'active', label: '進行中' },
  { value: 'done', label: '完成' },
  { value: 'failed', label: '失敗' },
  { value: 'pending', label: '排隊中' },
]

/** Auto-refresh cadence while any job is still running. */
const LIVE_REFRESH_MS = 5000

// useSearchParams needs a Suspense boundary during prerender.
export default function AdminJobsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">載入中…</p>}>
      <JobsPageContent />
    </Suspense>
  )
}

function JobsPageContent() {
  // Deep links from the keyword analytics page pre-fill the filter.
  const initialKeyword = useSearchParams().get('keyword') ?? ''

  const [items, setItems] = useState<JobSummary[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<JobStats | null>(null)
  const [loading, setLoading] = useState(true)

  const [status, setStatus] = useState('all')
  const [keywordInput, setKeywordInput] = useState(initialKeyword)
  const [keyword, setKeyword] = useState(initialKeyword)
  const [page, setPage] = useState(1)

  const [deleteTarget, setDeleteTarget] = useState<JobSummary | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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
      toast.success(`已重新執行「${job.keyword}」`, {
        description: `新任務 ${result.jobId}`,
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
      toast.success(`已刪除任務 ${deleteTarget.id}`)
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
      toast.success(`已將 ${result.updated} 個逾時任務標記為失敗`)
      await refresh({ silent: true })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">任務監控</h1>
          <p className="text-sm text-muted-foreground">
            行程產生任務的執行狀況；失敗的任務可查看錯誤原因並重新執行
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
          重新整理
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="執行中"
          value={stats ? String(stats.queue.running) : '—'}
          hint={stats ? `佇列等待 ${stats.queue.queued}` : undefined}
        />
        <StatCard
          label="近 24 小時成功率"
          value={stats ? formatPercent(stats.last24h.successRate) : '—'}
          hint={
            stats
              ? `完成 ${stats.last24h.done} · 失敗 ${stats.last24h.failed}`
              : undefined
          }
        />
        <StatCard
          label="平均耗時（近 24h）"
          value={
            stats?.last24h.avgDurationMs
              ? formatDuration(stats.last24h.avgDurationMs)
              : '—'
          }
          hint={
            stats?.last24h.p95DurationMs
              ? `P95 ${formatDuration(stats.last24h.p95DurationMs)}`
              : undefined
          }
        />
        <StatCard label="累計任務" value={stats ? String(stats.total) : '—'} />
      </div>

      {/* Jobs run in-process, so a restart strands them mid-pipeline forever. */}
      {stats && stats.stuck > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>
              有 <strong>{stats.stuck}</strong> 個任務超過 {stats.stuckAfterMinutes}{' '}
              分鐘沒有進度，可能是後端重啟造成的殘留
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleFailStuck()}>
            全部標記為失敗
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
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-1 gap-2 sm:max-w-xs">
          <Input
            value={keywordInput}
            placeholder="搜尋關鍵字…"
            onChange={(event) => setKeywordInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
          />
          <Button variant="outline" size="icon" onClick={handleSearch} aria-label="搜尋">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>關鍵字</TableHead>
              <TableHead className="w-28">狀態</TableHead>
              <TableHead className="w-20 text-right">進度</TableHead>
              <TableHead className="hidden w-24 text-right md:table-cell">文件</TableHead>
              <TableHead className="hidden w-28 text-right lg:table-cell">耗時</TableHead>
              <TableHead className="hidden w-40 lg:table-cell">建立時間</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  載入中…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  沒有符合條件的任務
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
                      aria-label={`重新執行 ${job.keyword}`}
                      title="重新執行"
                    >
                      <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(job)}
                      aria-label={`刪除 ${job.keyword}`}
                      title="刪除"
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
          共 {total} 筆 · 第 {page} / {totalPages} 頁
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((prev) => prev - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            上一頁
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => prev + 1)}
          >
            下一頁
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
            <AlertDialogTitle>刪除任務「{deleteTarget?.keyword}」？</AlertDialogTitle>
            <AlertDialogDescription>
              會一併刪除此任務的查詢、文件與行程結果，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>刪除</AlertDialogAction>
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
