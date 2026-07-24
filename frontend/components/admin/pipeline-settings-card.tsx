'use client'

import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/lib/i18n/context'
import {
  createSetting,
  updateSetting,
  type Setting,
} from '@/lib/admin'

/**
 * Defaults must stay in sync with `tripConfig` in the backend. Used when a
 * row is missing from the KV table so the form still shows the live fallback.
 */
const DEFAULTS = {
  targetDocuments: 30,
  crawlConcurrency: 5,
  cacheTtlDays: 7,
  resultsPerQuery: 12,
  maxDocumentsPerHost: 3,
  maxConcurrentJobs: 3,
} as const

type FieldKey = keyof typeof DEFAULTS

const FIELDS: {
  key: FieldKey
  settingKey: string
  min: number
}[] = [
  { key: 'targetDocuments', settingKey: 'trip.targetDocuments', min: 1 },
  { key: 'crawlConcurrency', settingKey: 'trip.crawlConcurrency', min: 1 },
  { key: 'cacheTtlDays', settingKey: 'trip.cacheTtlDays', min: 0 },
  { key: 'resultsPerQuery', settingKey: 'trip.resultsPerQuery', min: 1 },
  { key: 'maxDocumentsPerHost', settingKey: 'trip.maxDocumentsPerHost', min: 1 },
  { key: 'maxConcurrentJobs', settingKey: 'trip.maxConcurrentJobs', min: 1 },
]

function readNumber(settings: Setting[], settingKey: string, fallback: number) {
  const raw = settings.find((s) => s.key === settingKey)?.value
  if (raw === undefined) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Dedicated editor for the trip pipeline runtime knobs, so operators can tune
 * fetch volume / concurrency / cache without hunting through the KV table.
 * Writes through the same settings API; the next job picks up the change.
 */
export function PipelineSettingsCard({
  settings,
  onSaved,
}: {
  settings: Setting[]
  onSaved: () => Promise<void>
}) {
  const { t } = useLanguage()
  const copy = t.admin.pipeline

  const [values, setValues] = useState<Record<FieldKey, string>>({
    targetDocuments: String(DEFAULTS.targetDocuments),
    crawlConcurrency: String(DEFAULTS.crawlConcurrency),
    cacheTtlDays: String(DEFAULTS.cacheTtlDays),
    resultsPerQuery: String(DEFAULTS.resultsPerQuery),
    maxDocumentsPerHost: String(DEFAULTS.maxDocumentsPerHost),
    maxConcurrentJobs: String(DEFAULTS.maxConcurrentJobs),
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValues({
      targetDocuments: String(
        readNumber(settings, 'trip.targetDocuments', DEFAULTS.targetDocuments),
      ),
      crawlConcurrency: String(
        readNumber(settings, 'trip.crawlConcurrency', DEFAULTS.crawlConcurrency),
      ),
      cacheTtlDays: String(
        readNumber(settings, 'trip.cacheTtlDays', DEFAULTS.cacheTtlDays),
      ),
      resultsPerQuery: String(
        readNumber(settings, 'trip.resultsPerQuery', DEFAULTS.resultsPerQuery),
      ),
      maxDocumentsPerHost: String(
        readNumber(
          settings,
          'trip.maxDocumentsPerHost',
          DEFAULTS.maxDocumentsPerHost,
        ),
      ),
      maxConcurrentJobs: String(
        readNumber(
          settings,
          'trip.maxConcurrentJobs',
          DEFAULTS.maxConcurrentJobs,
        ),
      ),
    })
  }, [settings])

  const serverValues: Record<FieldKey, number> = {
    targetDocuments: readNumber(
      settings,
      'trip.targetDocuments',
      DEFAULTS.targetDocuments,
    ),
    crawlConcurrency: readNumber(
      settings,
      'trip.crawlConcurrency',
      DEFAULTS.crawlConcurrency,
    ),
    cacheTtlDays: readNumber(settings, 'trip.cacheTtlDays', DEFAULTS.cacheTtlDays),
    resultsPerQuery: readNumber(
      settings,
      'trip.resultsPerQuery',
      DEFAULTS.resultsPerQuery,
    ),
    maxDocumentsPerHost: readNumber(
      settings,
      'trip.maxDocumentsPerHost',
      DEFAULTS.maxDocumentsPerHost,
    ),
    maxConcurrentJobs: readNumber(
      settings,
      'trip.maxConcurrentJobs',
      DEFAULTS.maxConcurrentJobs,
    ),
  }

  // Compare raw input strings so a cleared / non-numeric field stays dirty
  // (and Save stays enabled long enough to surface validation on click).
  const dirty = FIELDS.some(
    ({ key }) => values[key].trim() !== String(serverValues[key]),
  )

  const save = async () => {
    const parsed: Partial<Record<FieldKey, number>> = {}
    for (const field of FIELDS) {
      const n = Number(values[field.key].trim())
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < field.min) {
        toast.error(copy.invalid)
        return
      }
      parsed[field.key] = n
    }

    setSaving(true)
    try {
      for (const field of FIELDS) {
        const value = String(parsed[field.key])
        const existing = settings.find((s) => s.key === field.settingKey)
        const description = copy.desc[field.key]
        if (existing) {
          await updateSetting(field.settingKey, {
            value,
            valueType: 'number',
            description,
          })
        } else {
          await createSetting({
            key: field.settingKey,
            value,
            valueType: 'number',
            description,
          })
        }
      }
      toast.success(copy.updated)
      await onSaved()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="h-4 w-4" />
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`pipeline-${field.key}`}>
                {copy.fields[field.key]}
              </Label>
              <Input
                id={`pipeline-${field.key}`}
                type="number"
                min={field.min}
                step={1}
                className="font-mono text-sm"
                value={values[field.key]}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {copy.help[field.key]}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? t.common.saving : t.common.save}
          </Button>
          <p className="text-xs text-muted-foreground">{copy.footer}</p>
        </div>
      </CardContent>
    </Card>
  )
}
