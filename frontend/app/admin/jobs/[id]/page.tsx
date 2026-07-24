'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  EyeOff,
  Pin,
  RefreshCw,
  RotateCw,
  Square,
  Star,
} from 'lucide-react'
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
import {
  cancelJob,
  getJobDetail,
  retryJob,
  setJobCuration,
  type JobCuration,
  type JobDetail,
  type JobPreferences,
} from '@/lib/admin'
import {
  JobStatusBadge,
  formatDateTime,
  formatDuration,
} from '@/components/admin/job-status-badge'
import { fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import {
  hasTripPreferences,
  type TripBudget,
  type TripCompanions,
  type TripPace,
  type TripPreferences,
} from '@/lib/trip'

const ACTIVE_STATUSES = new Set([
  'pending',
  'planning',
  'searching',
  'crawling',
  'composing',
])

function asTripPreferences(raw: JobPreferences | null): TripPreferences | null {
  if (!raw || typeof raw !== 'object') return null
  const prefs: TripPreferences = {
    durationDays:
      typeof raw.durationDays === 'number' ? raw.durationDays : null,
    companions: (raw.companions as TripCompanions | null) ?? null,
    pace: (raw.pace as TripPace | null) ?? null,
    budget: (raw.budget as TripBudget | null) ?? null,
    mustVisit: Array.isArray(raw.mustVisit)
      ? raw.mustVisit.filter((item): item is string => typeof item === 'string')
      : [],
    avoid: Array.isArray(raw.avoid)
      ? raw.avoid.filter((item): item is string => typeof item === 'string')
      : [],
  }
  return hasTripPreferences(prefs) ? prefs : null
}

export default function AdminJobDetailPage() {
  const { t } = useLanguage()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const jobId = params.id

  const [job, setJob] = useState<JobDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [curatingKey, setCuratingKey] = useState<keyof JobCuration | null>(null)

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

  const preferences = useMemo(
    () => (job ? asTripPreferences(job.preferences) : null),
    [job],
  )

  const handleRetry = async () => {
    if (!job) return
    setRetrying(true)
    try {
      const result = await retryJob(job.id)
      toast.success(t.admin.jobDetail.newJobCreated)
      router.push(`/admin/jobs/${result.jobId}`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setRetrying(false)
    }
  }

  const handleCancel = async () => {
    if (!job) return
    setCancelling(true)
    try {
      await cancelJob(job.id)
      toast.success(fmt(t.admin.jobs.cancelled, { keyword: job.keyword }))
      await refresh({ silent: true })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setCancelling(false)
    }
  }

  const toggleCuration = async (key: keyof JobCuration) => {
    if (!job?.itinerary) return
    setCuratingKey(key)
    try {
      const next = await setJobCuration(job.id, { [key]: !job.itinerary[key] })
      // Merge the authoritative new state back into the itinerary.
      setJob((prev) =>
        prev?.itinerary
          ? { ...prev, itinerary: { ...prev.itinerary, ...next } }
          : prev,
      )
      toast.success(t.admin.curation.updated)
    } catch (error) {
      toast.error((error as Error).message || t.admin.curation.updateFailed)
    } finally {
      setCuratingKey(null)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t.common.loading}</p>
  if (!job) return <p className="text-sm text-muted-foreground">{t.admin.jobDetail.notFound}</p>

  const fetched = job.documentStats.fetched ?? 0
  const failedDocs = job.documentStats.failed ?? 0
  const pendingDocs = job.documentStats.pending ?? 0
  const prefs = t.tripPreferences

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild aria-label={t.admin.jobDetail.backToList}>
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
          <Button variant="outline" size="sm" asChild>
            <Link href={`/trip/${job.id}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              {t.admin.jobDetail.openFrontend}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            {t.common.refresh}
          </Button>
          {ACTIVE_STATUSES.has(job.status) && (
            <Button
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={() => void handleCancel()}
            >
              <Square className="h-4 w-4" />
              {cancelling ? t.admin.jobDetail.cancelling : t.admin.jobDetail.cancel}
            </Button>
          )}
          <Button size="sm" disabled={retrying} onClick={() => void handleRetry()}>
            <RotateCw className="h-4 w-4" />
            {retrying ? t.admin.jobDetail.retrying : t.admin.jobDetail.retry}
          </Button>
        </div>
      </div>

      {job.error && (
        <Card className="gap-2 border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">{t.admin.jobDetail.failReason}</p>
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
          <Field label={t.admin.jobDetail.createdAt} value={formatDateTime(job.createdAt)} />
          <Field label={t.admin.jobDetail.updatedAt} value={formatDateTime(job.updatedAt)} />
          <Field label={t.admin.jobDetail.duration} value={formatDuration(job.durationMs)} />
          <Field label={t.admin.jobDetail.model} value={job.itinerary?.model ?? '—'} />
        </div>
      </Card>

      {job.itinerary && (
        <Card className="gap-3 p-4">
          <div>
            <p className="text-sm font-medium">{t.admin.curation.title}</p>
            <p className="text-xs text-muted-foreground">{t.admin.curation.hint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={job.itinerary.pinned ? 'default' : 'outline'}
              size="sm"
              disabled={curatingKey !== null}
              aria-pressed={job.itinerary.pinned}
              title={t.admin.curation.pinnedHint}
              onClick={() => void toggleCuration('pinned')}
            >
              <Pin className="h-4 w-4" />
              {t.admin.curation.pinned}
            </Button>
            <Button
              type="button"
              variant={job.itinerary.featured ? 'default' : 'outline'}
              size="sm"
              disabled={curatingKey !== null}
              aria-pressed={job.itinerary.featured}
              title={t.admin.curation.featuredHint}
              onClick={() => void toggleCuration('featured')}
            >
              <Star className="h-4 w-4" />
              {t.admin.curation.featured}
            </Button>
            <Button
              type="button"
              variant={job.itinerary.hidden ? 'destructive' : 'outline'}
              size="sm"
              disabled={curatingKey !== null}
              aria-pressed={job.itinerary.hidden}
              title={t.admin.curation.hiddenHint}
              onClick={() => void toggleCuration('hidden')}
            >
              <EyeOff className="h-4 w-4" />
              {t.admin.curation.hidden}
            </Button>
          </div>
        </Card>
      )}

      <Card className="gap-3 p-4">
        <p className="text-sm font-medium">{t.admin.jobDetail.preferences}</p>
        {preferences ? (
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {preferences.durationDays != null && (
              <Field
                label={prefs.days}
                value={fmt(prefs.daysValue, { n: preferences.durationDays })}
              />
            )}
            {preferences.companions && (
              <Field
                label={prefs.companions}
                value={
                  prefs.companionOptions[
                    preferences.companions as keyof typeof prefs.companionOptions
                  ] ?? preferences.companions
                }
              />
            )}
            {preferences.pace && (
              <Field
                label={prefs.pace}
                value={
                  prefs.paceOptions[
                    preferences.pace as keyof typeof prefs.paceOptions
                  ] ?? preferences.pace
                }
              />
            )}
            {preferences.budget && (
              <Field
                label={prefs.budget}
                value={
                  prefs.budgetOptions[
                    preferences.budget as keyof typeof prefs.budgetOptions
                  ] ?? preferences.budget
                }
              />
            )}
            {preferences.mustVisit.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground">{prefs.mustVisit}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {preferences.mustVisit.map((place) => (
                    <Badge key={place} variant="secondary">
                      {place}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {preferences.avoid.length > 0 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-muted-foreground">{prefs.avoid}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {preferences.avoid.map((place) => (
                    <Badge key={place} variant="outline">
                      {place}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t.admin.jobDetail.preferencesEmpty}
          </p>
        )}
      </Card>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">
            {fmt(t.admin.jobDetail.tabDocuments, { n: job.documents.length })}
          </TabsTrigger>
          <TabsTrigger value="queries">
            {fmt(t.admin.jobDetail.tabQueries, { n: job.queries.length })}
          </TabsTrigger>
          <TabsTrigger value="itinerary">{t.admin.jobDetail.tabItinerary}</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              {fmt(t.admin.jobDetail.docFetched, { n: fetched })}
            </Badge>
            <Badge variant="secondary" className="bg-destructive/15 text-destructive">
              {fmt(t.admin.jobDetail.docFailed, { n: failedDocs })}
            </Badge>
            <Badge variant="secondary">{fmt(t.admin.jobDetail.docPending, { n: pendingDocs })}</Badge>
          </div>
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.admin.jobDetail.docColTitle}</TableHead>
                  <TableHead className="w-24">{t.admin.jobDetail.docColStatus}</TableHead>
                  <TableHead className="min-w-[12rem]">{t.admin.jobDetail.docColError}</TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">{t.admin.jobDetail.docColFetchedAt}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      {t.admin.jobDetail.docEmpty}
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
                      <TableCell className="max-w-xs font-mono text-xs text-muted-foreground">
                        {doc.error ? (
                          <span className="whitespace-pre-wrap break-words text-destructive">
                            {doc.error}
                          </span>
                        ) : (
                          '—'
                        )}
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
                  <TableHead>{t.admin.jobDetail.queryColText}</TableHead>
                  <TableHead className="hidden w-40 md:table-cell">{t.admin.jobDetail.queryColIntent}</TableHead>
                  <TableHead className="w-20">{t.admin.jobDetail.queryColLang}</TableHead>
                  <TableHead className="w-20 text-right">{t.admin.jobDetail.queryColResults}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.queries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      {t.admin.jobDetail.queryEmpty}
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
                <p className="text-xs text-muted-foreground">{t.admin.jobDetail.summary}</p>
                <p className="mt-1 text-sm">{job.itinerary.summary}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.admin.jobDetail.rawOutput}</p>
                <pre className="mt-1 max-h-[32rem] overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {JSON.stringify(job.itinerary.data, null, 2)}
                </pre>
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              {t.admin.jobDetail.itineraryEmpty}
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
