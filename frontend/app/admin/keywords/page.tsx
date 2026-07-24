'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getContentGaps,
  getHostStats,
  getJobTrend,
  getKeywordStats,
  setHostOverride,
  type ContentGap,
  type HostStat,
  type KeywordStat,
  type TrendPoint,
} from '@/lib/admin'
import { formatDateTime, formatPercent } from '@/components/admin/job-status-badge'
import { bcp47, fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import { Input } from '@/components/ui/input'

const RANGE_VALUES = ['7', '30', '90'] as const
const RANGE_KEY: Record<string, 'd7' | 'd30' | 'd90'> = {
  '7': 'd7',
  '30': 'd30',
  '90': 'd90',
}

/** A keyword needs a few runs before its failure rate means anything. */
const MIN_RUNS_FOR_ALERT = 2

export default function AdminKeywordsPage() {
  const { t } = useLanguage()
  const [days, setDays] = useState('30')
  const [keywords, setKeywords] = useState<KeywordStat[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [gaps, setGaps] = useState<ContentGap[]>([])
  const [hosts, setHosts] = useState<HostStat[]>([])
  const [loading, setLoading] = useState(true)
  const [hostBusy, setHostBusy] = useState<string | null>(null)
  const [manualHost, setManualHost] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    const range = Number(days)
    try {
      const [keywordRows, trendRows, gapRows, hostRows] = await Promise.all([
        getKeywordStats(range, 50),
        getJobTrend(range),
        getContentGaps(range, 5),
        getHostStats(range),
      ])
      setKeywords(keywordRows)
      setTrend(trendRows)
      setGaps(gapRows)
      setHosts(hostRows)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const applyHostOverride = useCallback(
    async (host: string, action: 'allow' | 'deny' | 'clear') => {
      setHostBusy(`${host}:${action}`)
      try {
        await setHostOverride(host, action)
        toast.success(
          action === 'allow'
            ? t.admin.keywords.hostAllowSaved
            : action === 'deny'
              ? t.admin.keywords.hostDenySaved
              : t.admin.keywords.hostClearSaved,
        )
        await refresh()
      } catch (error) {
        toast.error((error as Error).message)
      } finally {
        setHostBusy(null)
      }
    },
    [refresh, t],
  )

  const addManualHost = useCallback(
    async (action: 'allow' | 'deny') => {
      const host = manualHost.trim()
      if (!host) return
      await applyHostOverride(host, action)
      setManualHost('')
    },
    [applyHostOverride, manualHost],
  )

  const totalRuns = keywords.reduce((sum, row) => sum + row.total, 0)
  const problemKeywords = keywords.filter(
    (row) =>
      row.total >= MIN_RUNS_FOR_ALERT &&
      row.failureRate !== null &&
      row.failureRate > 0.3,
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.keywords.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.keywords.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t.admin.range[RANGE_KEY[value]]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            {t.common.refresh}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t.admin.keywords.stat.unique} value={String(keywords.length)} />
        <StatCard label={t.admin.keywords.stat.total} value={String(totalRuns)} />
        <StatCard
          label={t.admin.keywords.stat.highFailure}
          value={String(problemKeywords.length)}
          hint={t.admin.keywords.stat.highFailureHint}
        />
      </div>

      <TrendChart data={trend} loading={loading} />

      <Tabs defaultValue="keywords">
        <TabsList>
          <TabsTrigger value="keywords">{t.admin.keywords.tabTop}</TabsTrigger>
          <TabsTrigger value="gaps">{fmt(t.admin.keywords.tabGaps, { n: gaps.length })}</TabsTrigger>
          <TabsTrigger value="hosts">{fmt(t.admin.keywords.tabHosts, { n: hosts.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="keywords">
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.admin.keywords.col.keyword}</TableHead>
                  <TableHead className="w-20 text-right">{t.admin.keywords.col.count}</TableHead>
                  <TableHead className="w-20 text-right">{t.admin.keywords.col.done}</TableHead>
                  <TableHead className="w-20 text-right">{t.admin.keywords.col.failed}</TableHead>
                  <TableHead className="w-24 text-right">{t.admin.keywords.col.failureRate}</TableHead>
                  <TableHead className="hidden w-28 text-right md:table-cell">
                    {t.admin.keywords.col.avgDocs}
                  </TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">{t.admin.keywords.col.lastQuery}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      {t.common.loading}
                    </TableCell>
                  </TableRow>
                ) : keywords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      {t.admin.keywords.emptyQueries}
                    </TableCell>
                  </TableRow>
                ) : (
                  keywords.map((row) => {
                    const risky =
                      row.total >= MIN_RUNS_FOR_ALERT &&
                      row.failureRate !== null &&
                      row.failureRate > 0.3
                    return (
                      <TableRow key={row.keyword}>
                        <TableCell className="max-w-64">
                          <Link
                            href={`/admin/jobs?keyword=${encodeURIComponent(row.keyword)}`}
                            className="font-medium hover:underline"
                          >
                            {row.keyword}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.done}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.failed}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {risky ? (
                            <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                              {formatPercent(row.failureRate)}
                            </Badge>
                          ) : (
                            formatPercent(row.failureRate)
                          )}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {row.avgDocuments === null ? '—' : row.avgDocuments.toFixed(1)}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {formatDateTime(row.lastAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="gaps" className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t.admin.keywords.gapsIntro}
          </p>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.admin.keywords.gapsCol.keyword}</TableHead>
                  <TableHead className="w-24 text-right">{t.admin.keywords.gapsCol.jobs}</TableHead>
                  <TableHead className="w-28 text-right">{t.admin.keywords.gapsCol.avgDocs}</TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">{t.admin.keywords.gapsCol.lastQuery}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gaps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      {t.admin.keywords.gapsEmpty}
                    </TableCell>
                  </TableRow>
                ) : (
                  gaps.map((row) => (
                    <TableRow key={row.keyword}>
                      <TableCell>
                        <Link
                          href={`/admin/jobs?keyword=${encodeURIComponent(row.keyword)}`}
                          className="font-medium hover:underline"
                        >
                          {row.keyword}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.jobs}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.avgDocuments === null ? '—' : row.avgDocuments.toFixed(1)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {formatDateTime(row.lastAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="hosts" className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t.admin.keywords.hostsIntro}
          </p>
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-background p-3">
            <div className="min-w-56 flex-1 space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="manual-host">
                {t.admin.keywords.hostAddLabel}
              </label>
              <Input
                id="manual-host"
                value={manualHost}
                onChange={(event) => setManualHost(event.target.value)}
                placeholder={t.admin.keywords.hostAddPlaceholder}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void addManualHost('deny')
                  }
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!manualHost.trim() || hostBusy !== null}
              onClick={() => void addManualHost('allow')}
            >
              {t.admin.keywords.hostActionAllow}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!manualHost.trim() || hostBusy !== null}
              onClick={() => void addManualHost('deny')}
            >
              {t.admin.keywords.hostActionDeny}
            </Button>
          </div>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.admin.keywords.hostsCol.host}</TableHead>
                  <TableHead className="w-24 text-right">{t.admin.keywords.hostsCol.attempts}</TableHead>
                  <TableHead className="w-24 text-right">{t.admin.keywords.hostsCol.success}</TableHead>
                  <TableHead className="w-28 text-right">{t.admin.keywords.hostsCol.successRate}</TableHead>
                  <TableHead className="w-36">{t.admin.keywords.hostsCol.status}</TableHead>
                  <TableHead className="w-52 text-right">{t.admin.keywords.hostsCol.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                      {t.admin.keywords.hostsEmpty}
                    </TableCell>
                  </TableRow>
                ) : (
                  hosts.map((row) => (
                    <TableRow key={row.host}>
                      <TableCell className="font-mono text-sm">{row.host}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.attempts}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.fetched}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.attempts > 0 ? formatPercent(row.successRate) : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.allowMatch && (
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700">
                              {t.admin.keywords.hostWhitelisted}
                            </Badge>
                          )}
                          {row.denyMatch && (
                            <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                              {t.admin.keywords.hostBlacklisted}
                            </Badge>
                          )}
                          {row.autoBlocked && !row.allowMatch && (
                            <Badge variant="secondary" className="bg-amber-500/15 text-amber-800">
                              {t.admin.keywords.autoBlocked}
                            </Badge>
                          )}
                          {row.staticBlocked && !row.allowMatch && !row.denyMatch && (
                            <Badge variant="secondary">
                              {t.admin.keywords.hostStaticBlocked}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {row.override !== 'allow' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={hostBusy !== null}
                              onClick={() => void applyHostOverride(row.host, 'allow')}
                            >
                              {t.admin.keywords.hostActionAllow}
                            </Button>
                          )}
                          {row.override !== 'deny' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={hostBusy !== null}
                              onClick={() => void applyHostOverride(row.host, 'deny')}
                            >
                              {t.admin.keywords.hostActionDeny}
                            </Button>
                          )}
                          {row.override && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={hostBusy !== null}
                              onClick={() => void applyHostOverride(row.host, 'clear')}
                            >
                              {t.admin.keywords.hostActionClear}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Daily volume as stacked bars. Deliberately plain CSS rather than a chart
 * library: one series pair, no axes worth the dependency.
 */
function TrendChart({ data, loading }: { data: TrendPoint[]; loading: boolean }) {
  const { t, locale } = useLanguage()
  const max = Math.max(1, ...data.map((point) => point.total))

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t.admin.keywords.chartTitle}</p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" />{t.admin.keywords.chartDone}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-destructive" />{t.admin.keywords.chartFailed}
          </span>
        </div>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t.common.loading}</p>
      ) : data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t.admin.keywords.chartEmpty}</p>
      ) : (
        <div className="flex h-32 items-end gap-1 overflow-x-auto">
          {data.map((point) => {
            const other = point.total - point.done - point.failed
            return (
              <div
                key={String(point.day)}
                className="flex min-w-2 flex-1 flex-col justify-end gap-px"
                title={fmt(t.admin.keywords.chartTooltip, {
                  date: new Date(point.day).toLocaleDateString(bcp47(locale)),
                  total: point.total,
                  done: point.done,
                  failed: point.failed,
                })}
              >
                {other > 0 && (
                  <div
                    className="rounded-t-sm bg-muted-foreground/30"
                    style={{ height: `${(other / max) * 100}%` }}
                  />
                )}
                <div
                  className="bg-destructive"
                  style={{ height: `${(point.failed / max) * 100}%` }}
                />
                <div
                  className="rounded-b-sm bg-emerald-500"
                  style={{ height: `${(point.done / max) * 100}%` }}
                />
              </div>
            )
          })}
        </div>
      )}
    </Card>
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
