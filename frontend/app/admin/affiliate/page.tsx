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
import {
  getAffiliateAnalytics,
  getAffiliateConfig,
  saveAffiliateConfig,
  type AffiliateAnalytics,
  type AffiliateConfig,
  type AffiliateFunnelCounts,
} from '@/lib/admin'

const RANGE_OPTIONS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' },
  { value: '90', label: '近 90 天' },
]

const EVENT_LABEL: Record<string, string> = {
  cta_impression: '曝光',
  cta_click: '點擊',
  outbound_redirect: '導出',
}

const CATEGORY_LABEL: Record<string, string> = {
  lodging: '住宿',
  ticket: '票券',
}

const PARTNER_LABEL: Record<string, string> = {
  booking: 'Booking.com',
  trip: 'Trip.com',
  agoda: 'Agoda',
  google_hotels: 'Google 飯店',
  klook: 'Klook',
  kkday: 'KKday',
}

export default function AdminAffiliatePage() {
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
          <h1 className="text-2xl font-semibold">Affiliate 漏斗</h1>
          <p className="text-sm text-muted-foreground">
            行程頁住宿／票券 CTA 的曝光、點擊與導出轉換
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

      <AffiliateConfigCard />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="曝光 (impression)" value={fmt(summary?.impressions)} />
        <StatCard label="點擊 (click)" value={fmt(summary?.clicks)} />
        <StatCard label="導出 (redirect)" value={fmt(summary?.redirects)} />
        <StatCard
          label="點擊率 CTR"
          value={
            summary?.ctr === null || summary?.ctr === undefined
              ? '—'
              : formatPercent(summary.ctr)
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">依合作夥伴</h2>
          <FunnelTable
            loading={loading}
            rows={data?.byPartner ?? []}
            nameKey="partner"
            nameLabel={(partner) => PARTNER_LABEL[partner] ?? partner}
          />
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">依品類</h2>
          <FunnelTable
            loading={loading}
            rows={data?.byCategory ?? []}
            nameKey="category"
            nameLabel={(category) => CATEGORY_LABEL[category] ?? category}
          />
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">每日趨勢</h2>
        {loading && !data ? (
          <p className="text-sm text-muted-foreground">載入中…</p>
        ) : !data?.trend.length ? (
          <p className="text-sm text-muted-foreground">此區間尚無事件</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead className="text-right">曝光</TableHead>
                <TableHead className="text-right">點擊</TableHead>
                <TableHead className="text-right">導出</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.trend.map((row) => (
                <TableRow key={String(row.day)}>
                  <TableCell>{formatDay(row.day)}</TableCell>
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
        <h2 className="mb-3 text-sm font-semibold">最近事件</h2>
        {loading && !data ? (
          <p className="text-sm text-muted-foreground">載入中…</p>
        ) : !data?.recent.length ? (
          <p className="text-sm text-muted-foreground">此區間尚無事件</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead>
                <TableHead>事件</TableHead>
                <TableHead>品類</TableHead>
                <TableHead>夥伴</TableHead>
                <TableHead>標籤</TableHead>
                <TableHead>行程</TableHead>
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
                      {EVENT_LABEL[row.event] ?? row.event}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {CATEGORY_LABEL[row.category] ?? row.category}
                  </TableCell>
                  <TableCell>
                    {PARTNER_LABEL[row.partner] ?? row.partner}
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
      toast.success('已儲存 affiliate 參數')
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
          <h2 className="text-sm font-semibold">Affiliate 參數設定</h2>
          <p className="text-xs text-muted-foreground">
            填入各家聯盟 ID，會注入行程頁住宿／票券外連連結。留空＝不帶該參數。
          </p>
        </div>
        <Button size="sm" onClick={() => void save()} disabled={loading || saving}>
          {saving ? '儲存中…' : '儲存'}
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
        placeholder="留空＝停用"
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
  if (loading && !rows.length) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">此區間尚無事件</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{nameKey === 'partner' ? '夥伴' : '品類'}</TableHead>
          <TableHead className="text-right">曝光</TableHead>
          <TableHead className="text-right">點擊</TableHead>
          <TableHead className="text-right">CTR</TableHead>
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

function formatDay(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}
