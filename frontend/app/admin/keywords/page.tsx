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
  type ContentGap,
  type HostStat,
  type KeywordStat,
  type TrendPoint,
} from '@/lib/admin'
import { formatDateTime, formatPercent } from '@/components/admin/job-status-badge'

const RANGE_OPTIONS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
]

/** A keyword needs a few runs before its failure rate means anything. */
const MIN_RUNS_FOR_ALERT = 2

export default function AdminKeywordsPage() {
  const [days, setDays] = useState('30')
  const [keywords, setKeywords] = useState<KeywordStat[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [gaps, setGaps] = useState<ContentGap[]>([])
  const [hosts, setHosts] = useState<HostStat[]>([])
  const [loading, setLoading] = useState(true)

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
          <h1 className="text-2xl font-semibold">關鍵字分析</h1>
          <p className="text-sm text-muted-foreground">
            使用者實際搜尋的關鍵字、成功率與內容覆蓋度
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            重新整理
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="不重複關鍵字" value={String(keywords.length)} />
        <StatCard label="總查詢次數" value={String(totalRuns)} />
        <StatCard
          label="高失敗率關鍵字"
          value={String(problemKeywords.length)}
          hint="失敗率 > 30% 且執行 2 次以上"
        />
      </div>

      <TrendChart data={trend} loading={loading} />

      <Tabs defaultValue="keywords">
        <TabsList>
          <TabsTrigger value="keywords">熱門關鍵字</TabsTrigger>
          <TabsTrigger value="gaps">內容缺口 ({gaps.length})</TabsTrigger>
          <TabsTrigger value="hosts">來源網域 ({hosts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="keywords">
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>關鍵字</TableHead>
                  <TableHead className="w-20 text-right">次數</TableHead>
                  <TableHead className="w-20 text-right">完成</TableHead>
                  <TableHead className="w-20 text-right">失敗</TableHead>
                  <TableHead className="w-24 text-right">失敗率</TableHead>
                  <TableHead className="hidden w-28 text-right md:table-cell">
                    平均文件
                  </TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">最後查詢</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      載入中…
                    </TableCell>
                  </TableRow>
                ) : keywords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      此區間沒有任何查詢紀錄
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
            這些關鍵字的任務有完成，但平均只抓到 5 篇以下的可用文件——行程內容會偏薄，
            不會被列為失敗，是最容易被忽略的品質問題。
          </p>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>關鍵字</TableHead>
                  <TableHead className="w-24 text-right">任務數</TableHead>
                  <TableHead className="w-28 text-right">平均文件</TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">最後查詢</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gaps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      沒有內容偏薄的關鍵字
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
            爬蟲對各網域的抓取成功率。標記為「自動封鎖」的網域，系統會在後續任務中
            主動略過（嘗試 3 次以上且從未成功）。
          </p>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>網域</TableHead>
                  <TableHead className="w-24 text-right">嘗試</TableHead>
                  <TableHead className="w-24 text-right">成功</TableHead>
                  <TableHead className="w-28 text-right">成功率</TableHead>
                  <TableHead className="w-28">狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hosts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                      此區間沒有足夠的抓取紀錄
                    </TableCell>
                  </TableRow>
                ) : (
                  hosts.map((row) => (
                    <TableRow key={row.host}>
                      <TableCell className="font-mono text-sm">{row.host}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.attempts}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.fetched}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(row.successRate)}
                      </TableCell>
                      <TableCell>
                        {row.autoBlocked && (
                          <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                            自動封鎖
                          </Badge>
                        )}
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
  const max = Math.max(1, ...data.map((point) => point.total))

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">每日查詢量</p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" />成功
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-destructive" />失敗
          </span>
        </div>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
      ) : data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">此區間沒有資料</p>
      ) : (
        <div className="flex h-32 items-end gap-1 overflow-x-auto">
          {data.map((point) => {
            const other = point.total - point.done - point.failed
            return (
              <div
                key={String(point.day)}
                className="flex min-w-2 flex-1 flex-col justify-end gap-px"
                title={`${new Date(point.day).toLocaleDateString('zh-TW')}\n總計 ${point.total} · 成功 ${point.done} · 失敗 ${point.failed}`}
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
