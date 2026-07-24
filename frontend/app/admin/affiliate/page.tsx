'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { formatDateTime, formatPercent } from '@/components/admin/job-status-badge'
import { bcp47 } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import {
  getAffiliateAnalytics,
  getAffiliateConfig,
  saveAffiliateConfig,
  type AffiliateAnalytics,
  type AffiliateConfig,
  type AffiliateFunnelCounts,
} from '@/lib/admin'

const RANGE_VALUES = ['7', '30', '90'] as const
const RANGE_KEY: Record<string, 'd7' | 'd30' | 'd90'> = {
  '7': 'd7',
  '30': 'd30',
  '90': 'd90',
}

export default function AdminAffiliatePage() {
  const { t, locale } = useLanguage()
  const eventLabel = (v: string) =>
    (t.admin.affiliate.eventLabel as Record<string, string>)[v] ?? v
  const categoryLabel = (v: string) =>
    (t.admin.affiliate.categoryLabel as Record<string, string>)[v] ?? v
  const partnerLabel = (v: string) =>
    (t.admin.affiliate.partnerLabel as Record<string, string>)[v] ?? v
  const [days, setDays] = useState('30')
  const [data, setData] = useState<AffiliateAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getAffiliateAnalytics(Number(days), 50))
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const summary = data?.summary

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.affiliate.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.affiliate.subtitle}
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

      <AffiliateConfigCard />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.admin.affiliate.stat.impression} value={fmt(summary?.impressions)} />
        <StatCard label={t.admin.affiliate.stat.click} value={fmt(summary?.clicks)} />
        <StatCard label={t.admin.affiliate.stat.redirect} value={fmt(summary?.redirects)} />
        <StatCard
          label={t.admin.affiliate.stat.ctr}
          value={
            summary?.ctr === null || summary?.ctr === undefined
              ? '—'
              : formatPercent(summary.ctr)
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t.admin.affiliate.byPartner}</h2>
          <FunnelTable
            loading={loading}
            rows={data?.byPartner ?? []}
            nameKey="partner"
            nameLabel={partnerLabel}
          />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">{t.admin.affiliate.byCategory}</h2>
          <FunnelTable
            loading={loading}
            rows={data?.byCategory ?? []}
            nameKey="category"
            nameLabel={categoryLabel}
          />
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">{t.admin.affiliate.dailyTrend}</h2>
        {loading && !data ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : !data?.trend.length ? (
          <p className="text-sm text-muted-foreground">{t.admin.affiliate.empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.admin.affiliate.trendCol.date}</TableHead>
                <TableHead className="text-right">{t.admin.affiliate.trendCol.impression}</TableHead>
                <TableHead className="text-right">{t.admin.affiliate.trendCol.click}</TableHead>
                <TableHead className="text-right">{t.admin.affiliate.trendCol.redirect}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trend.map((row) => (
                <TableRow key={String(row.day)}>
                  <TableCell>{formatDay(row.day, locale)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.impressions}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.clicks}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.redirects}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">{t.admin.affiliate.recentEvents}</h2>
        {loading && !data ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : !data?.recent.length ? (
          <p className="text-sm text-muted-foreground">{t.admin.affiliate.empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.admin.affiliate.recentCol.time}</TableHead>
                <TableHead>{t.admin.affiliate.recentCol.event}</TableHead>
                <TableHead>{t.admin.affiliate.recentCol.category}</TableHead>
                <TableHead>{t.admin.affiliate.recentCol.partner}</TableHead>
                <TableHead>{t.admin.affiliate.recentCol.label}</TableHead>
                <TableHead>{t.admin.affiliate.recentCol.trip}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {eventLabel(row.event)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {categoryLabel(row.category)}
                  </TableCell>
                  <TableCell>
                    {partnerLabel(row.partner)}
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-sm">
                    {row.label ?? '—'}
                    {row.day != null ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        · D{row.day}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate text-sm">
                    {row.jobId ? (
                      <Link
                        href={`/admin/jobs/${row.jobId}`}
                        className="text-primary hover:underline"
                        title={row.keyword ?? row.jobId}
                      >
                        {row.keyword ?? row.jobId.slice(0, 8)}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}

const EMPTY_CONFIG: AffiliateConfig = {
  booking: { aid: '' },
  trip: { allianceid: '', sid: '' },
  klook: { aid: '' },
  kkday: { cid: '' },
}

function AffiliateConfigCard() {
  const { t } = useLanguage()
  const [config, setConfig] = useState<AffiliateConfig>(EMPTY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await getAffiliateConfig()
        if (active) setConfig(data)
      } catch (error) {
        toast.error((error as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      setConfig(await saveAffiliateConfig(config))
      toast.success(t.admin.affiliate.configSaved)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t.admin.affiliate.configTitle}</h2>
          <p className="text-xs text-muted-foreground">
            {t.admin.affiliate.configDescription}
          </p>
        </div>
        <Button size="sm" onClick={() => void save()} disabled={loading || saving}>
          {saving ? t.common.saving : t.common.save}
        </Button>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConfigField
          label="Booking.com — aid"
          value={config.booking.aid}
          disabled={loading}
          onChange={(v) => setConfig((c) => ({ ...c, booking: { aid: v } }))}
        />
        <ConfigField
          label="Trip.com — Allianceid"
          value={config.trip.allianceid}
          disabled={loading}
          onChange={(v) =>
            setConfig((c) => ({ ...c, trip: { ...c.trip, allianceid: v } }))
          }
        />
        <ConfigField
          label="Trip.com — SID"
          value={config.trip.sid}
          disabled={loading}
          onChange={(v) =>
            setConfig((c) => ({ ...c, trip: { ...c.trip, sid: v } }))
          }
        />
        <ConfigField
          label="Klook — aid"
          value={config.klook.aid}
          disabled={loading}
          onChange={(v) => setConfig((c) => ({ ...c, klook: { aid: v } }))}
        />
        <ConfigField
          label="KKday — cid"
          value={config.kkday.cid}
          disabled={loading}
          onChange={(v) => setConfig((c) => ({ ...c, kkday: { cid: v } }))}
        />
      </div>
    </Card>
  )
}

function ConfigField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { t } = useLanguage()
  const id = label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t.admin.affiliate.configPlaceholder}
        autoComplete="off"
      />
    </div>
  )
}

function FunnelTable({
  loading,
  rows,
  nameKey,
  nameLabel,
}: {
  loading: boolean
  rows: Array<AffiliateFunnelCounts & Record<string, string | number | null>>
  nameKey: 'partner' | 'category'
  nameLabel: (value: string) => string
}) {
  const { t } = useLanguage()
  if (loading && !rows.length) {
    return <p className="text-sm text-muted-foreground">{t.common.loading}</p>
  }
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{t.admin.affiliate.empty}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            {nameKey === 'partner' ? t.admin.affiliate.colPartner : t.admin.affiliate.colCategory}
          </TableHead>
          <TableHead className="text-right">{t.admin.affiliate.trendCol.impression}</TableHead>
          <TableHead className="text-right">{t.admin.affiliate.trendCol.click}</TableHead>
          <TableHead className="text-right">{t.admin.affiliate.ctr}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const name = String(row[nameKey])
          return (
            <TableRow key={name}>
              <TableCell>{nameLabel(name)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.impressions}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.clicks}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.ctr === null ? '—' : formatPercent(row.ctr)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  )
}

function fmt(value: number | undefined) {
  return value === undefined ? '—' : String(value)
}

function formatDay(value: string, locale: import('@/lib/i18n').Locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(bcp47(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
