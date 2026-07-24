'use client'

import { useCallback, useEffect, useState } from 'react'
import { Database, Play, RefreshCw } from 'lucide-react'
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
import {
  getRetentionStatus,
  runRetention,
  type RetentionResult,
  type RetentionUsage,
} from '@/lib/admin'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

export function RetentionCard() {
  const [usage, setUsage] = useState<RetentionUsage | null>(null)
  const [preview, setPreview] = useState<RetentionResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const status = await getRetentionStatus()
      setUsage(status.usage)
      setPreview(status.preview)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleRun = async () => {
    setConfirmOpen(false)
    setRunning(true)
    try {
      const result = await runRetention()
      toast.success('清理完成', {
        description: `清除 ${result.contentStripped} 筆內文、刪除 ${result.jobsDeleted} 個任務、${result.cacheEntriesDeleted} 筆過期快取`,
      })
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const nothingToDo =
    preview !== null &&
    preview.contentStripped === 0 &&
    preview.jobsDeleted === 0 &&
    preview.cacheEntriesDeleted === 0

  return (
    <Card className="gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">資料保留</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              每天 03:17 自動清理。保留天數由 trip.contentRetentionDays（內文，預設 30 天）
              與 trip.jobRetentionDays（整筆任務，預設 180 天）控制，設為 0 可停用。
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            重新整理
          </Button>
          <Button
            size="sm"
            disabled={running || loading || nothingToDo}
            onClick={() => setConfirmOpen(true)}
          >
            <Play className="h-4 w-4" />
            {running ? '清理中…' : '立即清理'}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">載入中…</p>
      ) : usage && preview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="任務總數" value={usage.jobs.toLocaleString()} />
            <Metric
              label="已抓取文件"
              value={usage.documents.toLocaleString()}
              hint={`${usage.documentsWithContent.toLocaleString()} 筆仍保有內文`}
            />
            <Metric label="內文佔用" value={formatBytes(usage.contentBytes)} />
            <Metric
              label="擷取快取"
              value={usage.cacheEntries.toLocaleString()}
              hint={`${usage.expiredCache.toLocaleString()} 筆已過期`}
            />
          </div>

          <div className="rounded-lg border border-dashed p-3 text-sm">
            <p className="font-medium">下次清理將處理</p>
            {nothingToDo ? (
              <p className="mt-1 text-muted-foreground">目前沒有符合條件的資料</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>
                  清除 <strong className="text-foreground">{preview.contentStripped}</strong>{' '}
                  筆文件內文（{preview.contentRetentionDays} 天前的已完成任務）
                </li>
                <li>
                  刪除 <strong className="text-foreground">{preview.jobsDeleted}</strong>{' '}
                  個任務（{preview.jobRetentionDays} 天前）
                </li>
                <li>
                  刪除 <strong className="text-foreground">{preview.cacheEntriesDeleted}</strong>{' '}
                  筆過期擷取快取
                </li>
              </ul>
            )}
          </div>
        </>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>立即執行清理？</AlertDialogTitle>
          <AlertDialogHeader>
            <AlertDialogDescription>
              將清除 {preview?.contentStripped} 筆文件內文、刪除 {preview?.jobsDeleted}{' '}
              個任務與 {preview?.cacheEntriesDeleted} 筆過期快取。刪除的任務無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRun()}>執行清理</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
