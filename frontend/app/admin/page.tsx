'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Database,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatPercent } from '@/components/admin/job-status-badge'
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import {
  failStuckJobs,
  getAffiliateAnalytics,
  getJobStats,
  getKeywordStats,
  getRetentionStatus,
  type AffiliateAnalytics,
  type JobStats,
  type KeywordStat,
  type RetentionUsage,
} from '@/lib/admin'

/** Same threshold as `/admin/keywords` — a rate needs a few runs to mean anything. */
const MIN_RUNS_FOR_ALERT = 2
const HIGH_FAILURE_RATE = 0.3
const DASHBOARD_DAYS = 30
const TOP_PROBLEM_KEYWORDS = 8

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

export default function AdminDashboardPage() {
  const { t } = useLanguage()
  const [stats, setStats] = useState<JobStats | null>(null)
  const [problemKeywords, setProblemKeywords] = useState<KeywordStat[]>([])
  const [highFailureCount, setHighFailureCount] = useState(0)
  const [affiliate, setAffiliate] = useState<AffiliateAnalytics | null>(null)
  const [usage, setUsage] = useState<RetentionUsage | null>(null)
  const [loading, setLoading] = useState(true)
  const [failingStuck, setFailingStuck] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [jobStats, keywords, affiliateData, retention] = await Promise.all([
        getJobStats(),
        getKeywordStats(DASHBOARD_DAYS, 50),
        getAffiliateAnalytics(DASHBOARD_DAYS, 10),
        getRetentionStatus(),
      ])
      setStats(jobStats)
      // Summary card needs the full match count; the table only shows the top N.
      const problems = keywords
        .filter(
          (row) =>
            row.total >= MIN_RUNS_FOR_ALERT &&
            row.failureRate !== null &&
            row.failureRate > HIGH_FAILURE_RATE,
        )
        .sort((a, b) => (b.failureRate ?? 0) - (a.failureRate ?? 0))
      setHighFailureCount(problems.length)
      setProblemKeywords(problems.slice(0, TOP_PROBLEM_KEYWORDS))
      setAffiliate(affiliateData)
      setUsage(retention.usage)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleFailStuck = async () => {
    if (!stats) return
    setFailingStuck(true)
    try {
      const result = await failStuckJobs(stats.stuckAfterMinutes)
      toast.success(fmt(t.admin.jobs.markedFailed, { n: result.updated }))
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setFailingStuck(false)
    }
  }

  const summary = affiliate?.summary

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.dashboard.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.dashboard.subtitle}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
          {t.common.refresh}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label={t.admin.dashboard.stat.stuck}
          value={stats ? String(stats.stuck) : '—'}
          hint={
            stats
              ? fmt(t.admin.dashboard.stat.stuckHint, {
                  minutes: stats.stuckAfterMinutes,
                })
              : undefined
          }
          tone={stats && stats.stuck > 0 ? 'warn' : 'default'}
        />
        <SummaryCard
          label={t.admin.dashboard.stat.highFailure}
          value={loading && highFailureCount === 0 ? '—' : String(highFailureCount)}
          hint={t.admin.keywords.stat.highFailureHint}
          tone={highFailureCount > 0 ? 'warn' : 'default'}
        />
        <SummaryCard
          label={t.admin.dashboard.stat.ctr}
          value={
            summary?.ctr === null || summary?.ctr === undefined
              ? '—'
              : formatPercent(summary.ctr)
          }
          hint={
            summary
              ? fmt(t.admin.dashboard.stat.ctrHint, {
                  clicks: summary.clicks,
                  impressions: summary.impressions,
                })
              : undefined
          }
        />
        <SummaryCard
          label={t.admin.dashboard.stat.storage}
          value={usage ? formatBytes(usage.contentBytes) : '—'}
          hint={
            usage
              ? fmt(t.admin.dashboard.stat.storageHint, {
                  jobs: usage.jobs,
                  documents: usage.documentsWithContent,
                })
              : undefined
          }
        />
      </div>

      {stats && stats.stuck > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {fmt(t.admin.jobs.stuckBanner, {
                count: stats.stuck,
                minutes: stats.stuckAfterMinutes,
              })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/jobs">
                {t.admin.dashboard.openJobs}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={failingStuck}
              onClick={() => void handleFailStuck()}
            >
              {t.admin.jobs.markAllFailed}
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">
                  {t.admin.dashboard.sections.keywords}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {fmt(t.admin.dashboard.sections.keywordsHint, {
                    days: DASHBOARD_DAYS,
                  })}
                </p>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/keywords">
                {t.admin.dashboard.viewAll}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {loading && !problemKeywords.length ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : problemKeywords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.admin.dashboard.emptyKeywords}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.admin.keywords.col.keyword}</TableHead>
                  <TableHead className="text-right">
                    {t.admin.keywords.col.count}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.admin.keywords.col.failureRate}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problemKeywords.map((row) => (
                  <TableRow key={row.keyword}>
                    <TableCell className="max-w-[12rem] truncate font-medium">
                      {row.keyword}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {formatPercent(row.failureRate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">
                  {t.admin.dashboard.sections.affiliate}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {fmt(t.admin.dashboard.sections.affiliateHint, {
                    days: DASHBOARD_DAYS,
                  })}
                </p>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/affiliate">
                {t.admin.dashboard.viewAll}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {loading && !affiliate ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : !summary || summary.impressions === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.admin.dashboard.emptyAffiliate}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <MiniStat
                  label={t.admin.affiliate.stat.impression}
                  value={String(summary.impressions)}
                />
                <MiniStat
                  label={t.admin.affiliate.stat.click}
                  value={String(summary.clicks)}
                />
                <MiniStat
                  label={t.admin.affiliate.stat.ctr}
                  value={formatPercent(summary.ctr)}
                />
              </div>
              {affiliate && affiliate.byPartner.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.admin.affiliate.byPartner}</TableHead>
                      <TableHead className="text-right">
                        {t.admin.affiliate.stat.ctr}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {affiliate.byPartner.slice(0, 5).map((row) => (
                      <TableRow key={row.partner}>
                        <TableCell className="font-medium">
                          {(t.admin.affiliate.partnerLabel as Record<string, string>)[
                            row.partner
                          ] ?? row.partner}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(row.ctr)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </Card>

        <Card className="gap-3 p-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold">
                  {t.admin.dashboard.sections.storage}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t.admin.dashboard.sections.storageHint}
                </p>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/settings">
                {t.admin.dashboard.openSettings}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {loading && !usage ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : !usage ? (
            <p className="text-sm text-muted-foreground">
              {t.admin.dashboard.emptyStorage}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat
                label={t.admin.retention.metric.jobs}
                value={usage.jobs.toLocaleString()}
              />
              <MiniStat
                label={t.admin.retention.metric.documents}
                value={usage.documents.toLocaleString()}
                hint={fmt(t.admin.retention.documentsHint, {
                  n: usage.documentsWithContent,
                })}
              />
              <MiniStat
                label={t.admin.retention.metric.content}
                value={formatBytes(usage.contentBytes)}
              />
              <MiniStat
                label={t.admin.retention.metric.cache}
                value={usage.cacheEntries.toLocaleString()}
                hint={fmt(t.admin.retention.cacheHint, {
                  n: usage.expiredCache,
                })}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warn'
}) {
  return (
    <Card
      className={
        tone === 'warn'
          ? 'gap-1 border-amber-500/40 bg-amber-500/5 p-4'
          : 'gap-1 p-4'
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
