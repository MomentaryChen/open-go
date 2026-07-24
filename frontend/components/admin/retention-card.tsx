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
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
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
  const { t } = useLanguage()
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
      toast.success(t.admin.retention.cleaned, {
        description: fmt(t.admin.retention.cleanedDesc, {
          content: result.contentStripped,
          jobs: result.jobsDeleted,
          cache: result.cacheEntriesDeleted,
        }),
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
            <h2 className="font-semibold">{t.admin.retention.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.admin.retention.intro}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            {t.common.refresh}
          </Button>
          <Button
            size="sm"
            disabled={running || loading || nothingToDo}
            onClick={() => setConfirmOpen(true)}
          >
            <Play className="h-4 w-4" />
            {running ? t.admin.retention.cleaning : t.admin.retention.cleanNow}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      ) : usage && preview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label={t.admin.retention.metric.jobs} value={usage.jobs.toLocaleString()} />
            <Metric
              label={t.admin.retention.metric.documents}
              value={usage.documents.toLocaleString()}
              hint={fmt(t.admin.retention.documentsHint, {
                n: usage.documentsWithContent.toLocaleString(),
              })}
            />
            <Metric label={t.admin.retention.metric.content} value={formatBytes(usage.contentBytes)} />
            <Metric
              label={t.admin.retention.metric.cache}
              value={usage.cacheEntries.toLocaleString()}
              hint={fmt(t.admin.retention.cacheHint, { n: usage.expiredCache.toLocaleString() })}
            />
          </div>

          <div className="rounded-lg border border-dashed p-3 text-sm">
            <p className="font-medium">{t.admin.retention.nextCleanup}</p>
            {nothingToDo ? (
              <p className="mt-1 text-muted-foreground">{t.admin.retention.nothingToClean}</p>
            ) : (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>
                  {fmt(t.admin.retention.previewContent, {
                    n: preview.contentStripped,
                    days: preview.contentRetentionDays,
                  })}
                </li>
                <li>
                  {fmt(t.admin.retention.previewJobs, {
                    n: preview.jobsDeleted,
                    days: preview.jobRetentionDays,
                  })}
                </li>
                <li>{fmt(t.admin.retention.previewCache, { n: preview.cacheEntriesDeleted })}</li>
              </ul>
            )}
          </div>
        </>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>{t.admin.retention.confirmTitle}</AlertDialogTitle>
          <AlertDialogHeader>
            <AlertDialogDescription>
              {fmt(t.admin.retention.confirmDescription, {
                content: preview?.contentStripped ?? 0,
                jobs: preview?.jobsDeleted ?? 0,
                cache: preview?.cacheEntriesDeleted ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRun()}>
              {t.admin.retention.confirmRun}
            </AlertDialogAction>
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
