'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, RefreshCw, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getJobDetail, retryJob, type JobDetail } from '@/lib/admin'
import {
  JobStatusBadge,
  formatDateTime,
  formatDuration,
} from '@/components/admin/job-status-badge'

const ACTIVE_STATUSES = new Set([
  'pending',
  'planning',
  'searching',
  'crawling',
  'composing',
])

export default function AdminJobDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const jobId = params.id

  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true)
      try {
        setJob(await getJobDetail(jobId))
      } catch (error) {
        if (!options?.silent) toast.error((error as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [jobId],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Follow along while the pipeline is still running.
  useEffect(() => {
    if (!job || !ACTIVE_STATUSES.has(job.status)) return
    const timer = setInterval(() => void refresh({ silent: true }), 3000)
    return () => clearInterval(timer)
  }, [job, refresh])

  const handleRetry = async () => {
    if (!job) return
    setRetrying(true)
    try {
      const result = await retryJob(job.id)
      toast.success('已建立新任務')
      router.push(`/admin/jobs/${result.jobId}`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setRetrying(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">載入中…</p>
  if (!job) return <p className="text-sm text-muted-foreground">找不到此任務</p>

  const fetched = job.documentStats.fetched ?? 0
  const failedDocs = job.documentStats.failed ?? 0
  const pendingDocs = job.documentStats.pending ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label="返回任務列表">
            <Link href="/admin/jobs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{job.keyword}</h1>
              <JobStatusBadge status={job.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{job.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            重新整理
          </Button>
          <Button size="sm" disabled={retrying} onClick={() => void handleRetry()}>
            <RotateCw className="h-4 w-4" />
            {retrying ? '執行中…' : '重新執行'}
          </Button>
        </div>
      </div>

      {job.error && (
        <Card className="gap-2 border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">失敗原因</p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs">
            {job.error}
          </pre>
        </Card>
      )}

      <Card className="gap-3 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{job.message ?? '—'}</span>
          <span className="tabular-nums">{job.progress}%</span>
        </div>
        <Progress value={job.progress} />
        <div className="grid gap-3 pt-1 text-sm sm:grid-cols-4">
          <Field label="建立時間" value={formatDateTime(job.createdAt)} />
          <Field label="最後更新" value={formatDateTime(job.updatedAt)} />
          <Field label="耗時" value={formatDuration(job.durationMs)} />
          <Field label="使用模型" value={job.itinerary?.model ?? '—'} />
        </div>
      </Card>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">
            文件 ({job.documents.length})
          </TabsTrigger>
          <TabsTrigger value="queries">查詢 ({job.queries.length})</TabsTrigger>
          <TabsTrigger value="itinerary">行程結果</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              成功 {fetched}
            </Badge>
            <Badge variant="secondary" className="bg-destructive/15 text-destructive">
              失敗 {failedDocs}
            </Badge>
            <Badge variant="secondary">待處理 {pendingDocs}</Badge>
          </div>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>標題 / 網址</TableHead>
                  <TableHead className="w-24">狀態</TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">抓取時間</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                      尚無文件
                    </TableCell>
                  </TableRow>
                ) : (
                  job.documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="max-w-xl">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-medium hover:underline"
                        >
                          <span className="truncate">{doc.title || doc.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </a>
                        <p className="truncate text-xs text-muted-foreground">{doc.url}</p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            doc.status === 'fetched'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : doc.status === 'failed'
                                ? 'bg-destructive/15 text-destructive'
                                : ''
                          }
                        >
                          {doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {formatDateTime(doc.fetchedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="queries">
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>查詢字串</TableHead>
                  <TableHead className="hidden w-40 md:table-cell">意圖</TableHead>
                  <TableHead className="w-20">語言</TableHead>
                  <TableHead className="w-20 text-right">結果數</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.queries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      尚無查詢（規劃階段未完成）
                    </TableCell>
                  </TableRow>
                ) : (
                  job.queries.map((query) => (
                    <TableRow key={query.id}>
                      <TableCell className="font-mono text-sm">{query.query}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {query.intent ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">{query.language ?? '—'}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {query.resultCount}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="itinerary">
          {job.itinerary ? (
            <Card className="gap-3 p-4">
              <div>
                <p className="text-xs text-muted-foreground">摘要</p>
                <p className="mt-1 text-sm">{job.itinerary.summary}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">原始輸出</p>
                <pre className="mt-1 max-h-[32rem] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {JSON.stringify(job.itinerary.data, null, 2)}
                </pre>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              此任務尚未產生行程
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 tabular-nums">{value}</p>
    </div>
  )
}
