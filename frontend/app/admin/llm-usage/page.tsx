'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { getLlmUsage, type LlmUsageAnalytics } from '@/lib/admin'
import { bcp47, fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'

const RANGE_VALUES = ['7', '30', '90'] as const
const RANGE_KEY: Record<string, 'd7' | 'd30' | 'd90'> = {
  '7': 'd7',
  '30': 'd30',
  '90': 'd90',
}

export default function AdminLlmUsagePage() {
  const { t, locale } = useLanguage()
  const [days, setDays] = useState('30')
  const [data, setData] = useState<LlmUsageAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getLlmUsage(Number(days)))
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const compact = (value: number) =>
    value.toLocaleString(bcp47(locale), {
      notation: 'compact',
      maximumFractionDigits: 1,
    })
  const cost = (value: number | null) =>
    value === null
      ? t.admin.llmUsage.unknownPrice
      : `US$${value.toLocaleString(bcp47(locale), { maximumFractionDigits: value < 1 ? 4 : 2 })}`

  const totals = data?.totals

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.llmUsage.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.llmUsage.subtitle}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.admin.llmUsage.stat.calls}
          value={totals ? compact(totals.calls) : '—'}
        />
        <StatCard
          label={t.admin.llmUsage.stat.inputTokens}
          value={
            totals
              ? compact(
                  totals.inputTokens +
                    totals.cacheReadTokens +
                    totals.cacheWriteTokens,
                )
              : '—'
          }
        />
        <StatCard
          label={t.admin.llmUsage.stat.outputTokens}
          value={
            totals ? compact(totals.outputTokens + totals.thinkingTokens) : '—'
          }
        />
        <StatCard
          label={t.admin.llmUsage.stat.estimatedCost}
          value={totals ? cost(totals.estimatedCostUsd ?? 0) : '—'}
          hint={t.admin.llmUsage.stat.estimatedCostHint}
        />
      </div>

      <DailyChart data={data} loading={loading} compact={compact} cost={cost} />

      <div className="space-y-2">
        <p className="text-sm font-medium">{t.admin.llmUsage.byModelTitle}</p>
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.admin.llmUsage.col.model}</TableHead>
                <TableHead className="w-20 text-right">{t.admin.llmUsage.col.calls}</TableHead>
                <TableHead className="w-24 text-right">{t.admin.llmUsage.col.input}</TableHead>
                <TableHead className="w-24 text-right">{t.admin.llmUsage.col.output}</TableHead>
                <TableHead className="hidden w-24 text-right md:table-cell">
                  {t.admin.llmUsage.col.cacheRead}
                </TableHead>
                <TableHead className="hidden w-24 text-right md:table-cell">
                  {t.admin.llmUsage.col.thinking}
                </TableHead>
                <TableHead className="w-28 text-right">{t.admin.llmUsage.col.cost}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t.common.loading}
                  </TableCell>
                </TableRow>
              ) : !data || data.byModel.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    {t.admin.llmUsage.empty}
                  </TableCell>
                </TableRow>
              ) : (
                data.byModel.map((row) => (
                  <TableRow key={`${row.provider}/${row.model}`}>
                    <TableCell>
                      <p className="font-medium">{row.model}</p>
                      <p className="text-xs text-muted-foreground">{row.provider}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{compact(row.calls)}</TableCell>
                    <TableCell className="text-right tabular-nums">{compact(row.inputTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{compact(row.outputTokens)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {compact(row.cacheReadTokens)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {compact(row.thinkingTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cost(row.estimatedCostUsd)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

/**
 * Daily token volume as stacked bars (input-side vs output-side tokens).
 * Plain CSS like the keywords trend chart: two series, no axis worth a
 * chart-library dependency.
 */
function DailyChart({
  data,
  loading,
  compact,
  cost,
}: {
  data: LlmUsageAnalytics | null
  loading: boolean
  compact: (value: number) => string
  cost: (value: number | null) => string
}) {
  const { t, locale } = useLanguage()
  const daily = data?.daily ?? []
  const inputSide = (point: LlmUsageAnalytics['daily'][number]) =>
    point.inputTokens + point.cacheReadTokens + point.cacheWriteTokens
  const outputSide = (point: LlmUsageAnalytics['daily'][number]) =>
    point.outputTokens + point.thinkingTokens
  const max = Math.max(1, ...daily.map((point) => inputSide(point) + outputSide(point)))

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{t.admin.llmUsage.chartTitle}</p>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-sky-500" />
            {t.admin.llmUsage.chartInput}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" />
            {t.admin.llmUsage.chartOutput}
          </span>
        </div>
      </div>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t.common.loading}</p>
      ) : daily.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t.admin.llmUsage.chartEmpty}
        </p>
      ) : (
        <div className="flex h-32 items-end gap-1 overflow-x-auto">
          {daily.map((point) => (
            <div
              key={point.day}
              className="flex min-w-2 flex-1 flex-col justify-end gap-px"
              title={fmt(t.admin.llmUsage.chartTooltip, {
                date: new Date(point.day).toLocaleDateString(bcp47(locale)),
                input: compact(inputSide(point)),
                output: compact(outputSide(point)),
                cost: cost(point.estimatedCostUsd ?? 0),
              })}
            >
              <div
                className="rounded-t-sm bg-emerald-500"
                style={{ height: `${(outputSide(point) / max) * 100}%` }}
              />
              <div
                className="rounded-b-sm bg-sky-500"
                style={{ height: `${(inputSide(point) / max) * 100}%` }}
              />
            </div>
          ))}
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
