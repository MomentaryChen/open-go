'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe,
  KeyRound,
  ListOrdered,
  Percent,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDateTime, formatPercent } from '@/components/admin/job-status-badge'
import { getSystemHealth, type HealthStatus, type SystemHealth } from '@/lib/admin'
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'

const LIVE_REFRESH_MS = 15_000

const STATUS_CLASS: Record<HealthStatus, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  error: 'bg-destructive/15 text-destructive',
}

const STATUS_ICON = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
} as const

export default function AdminHealthPage() {
  const { t } = useLanguage()
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    try {
      setHealth(await getSystemHealth())
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!health || health.status === 'ok') return
    const id = window.setInterval(() => void refresh({ silent: true }), LIVE_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [health, refresh])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.admin.health.title}</h1>
          <p className="text-sm text-muted-foreground">{t.admin.health.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
          {t.common.refresh}
        </Button>
      </div>

      {loading && !health ? (
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      ) : health ? (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{t.admin.health.overall}</p>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={health.status} label={t.admin.health.status[health.status]} />
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {fmt(t.admin.health.checkedAt, {
                time: formatDateTime(health.checkedAt),
              })}
            </p>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <HealthCard
              icon={Database}
              title={t.admin.health.database.title}
              status={health.database.status}
              statusLabel={t.admin.health.status[health.database.status]}
              detail={health.database.detail}
            >
              <p className="text-sm text-muted-foreground">
                {fmt(t.admin.health.database.latency, {
                  ms: health.database.latencyMs,
                })}
              </p>
            </HealthCard>

            <HealthCard
              icon={Globe}
              title={t.admin.health.browsers.title}
              status={health.browsers.status}
              statusLabel={t.admin.health.status[health.browsers.status]}
              detail={health.browsers.detail}
            >
              <BrowserLine
                label={t.admin.health.browsers.search}
                enabled={health.browsers.search.enabled}
                launched={health.browsers.search.launched}
                labels={t.admin.health.browsers}
              />
              <BrowserLine
                label={t.admin.health.browsers.crawl}
                enabled={health.browsers.crawlFallback.enabled}
                launched={health.browsers.crawlFallback.launched}
                labels={t.admin.health.browsers}
              />
              <p className="text-sm">
                <span className="text-muted-foreground">
                  {t.admin.health.browsers.chromium}:{' '}
                </span>
                {health.browsers.chromium.available
                  ? fmt(t.admin.health.browsers.available, {
                      version: health.browsers.chromium.version ?? '—',
                    })
                  : t.admin.health.browsers.unavailable}
              </p>
            </HealthCard>

            <HealthCard
              icon={KeyRound}
              title={t.admin.health.llm.title}
              status={health.llm.status}
              statusLabel={t.admin.health.status[health.llm.status]}
              detail={health.llm.detail}
            >
              <p className="text-sm text-muted-foreground">
                {fmt(t.admin.health.llm.active, {
                  provider: health.llm.activeProvider,
                  model: health.llm.activeModel,
                })}
              </p>
              <KeyLine
                name="Gemini"
                ok={health.llm.keys.gemini}
                configured={t.admin.health.llm.configured}
                missing={t.admin.health.llm.missing}
              />
              <KeyLine
                name="Anthropic"
                ok={health.llm.keys.anthropic}
                configured={t.admin.health.llm.configured}
                missing={t.admin.health.llm.missing}
              />
            </HealthCard>

            <HealthCard
              icon={ListOrdered}
              title={t.admin.health.queue.title}
              status="ok"
              statusLabel={t.admin.health.status.ok}
            >
              <div className="grid grid-cols-2 gap-3">
                <Metric
                  label={t.admin.health.queue.running}
                  value={String(health.queue.running)}
                />
                <Metric
                  label={t.admin.health.queue.queued}
                  value={String(health.queue.queued)}
                />
              </div>
            </HealthCard>

            <HealthCard
              icon={Percent}
              title={t.admin.health.last24h.title}
              status={health.last24h.status}
              statusLabel={t.admin.health.status[health.last24h.status]}
              detail={health.last24h.detail}
            >
              <p className="text-2xl font-semibold tabular-nums">
                {formatPercent(health.last24h.successRate)}
              </p>
              <p className="text-sm text-muted-foreground">
                {health.last24h.done + health.last24h.failed === 0
                  ? t.admin.health.last24h.noFinished
                  : fmt(t.admin.health.last24h.doneFailed, {
                      done: health.last24h.done,
                      failed: health.last24h.failed,
                    })}
              </p>
            </HealthCard>
          </div>
        </>
      ) : null}
    </div>
  )
}

function StatusBadge({
  status,
  label,
}: {
  status: HealthStatus
  label: string
}) {
  const Icon = STATUS_ICON[status]
  return (
    <Badge
      variant="secondary"
      className={cn('gap-1 font-normal', STATUS_CLASS[status])}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Badge>
  )
}

function HealthCard({
  icon: Icon,
  title,
  status,
  statusLabel,
  detail,
  children,
}: {
  icon: typeof Database
  title: string
  status: HealthStatus
  statusLabel: string
  detail?: string
  children: ReactNode
}) {
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="font-semibold">{title}</h2>
        </div>
        <StatusBadge status={status} label={statusLabel} />
      </div>
      <div className="space-y-2">{children}</div>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </Card>
  )
}

function BrowserLine({
  label,
  enabled,
  launched,
  labels,
}: {
  label: string
  enabled: boolean
  launched: boolean
  labels: {
    enabled: string
    disabled: string
    launched: string
    idle: string
  }
}) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {enabled ? labels.enabled : labels.disabled}
      {enabled ? ` · ${launched ? labels.launched : labels.idle}` : null}
    </p>
  )
}

function KeyLine({
  name,
  ok,
  configured,
  missing,
}: {
  name: string
  ok: boolean
  configured: string
  missing: string
}) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{name}: </span>
      <span className={ok ? undefined : 'text-destructive'}>
        {ok ? configured : missing}
      </span>
    </p>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
