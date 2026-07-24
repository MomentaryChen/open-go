'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BrainCircuit,
  History,
  RotateCcw,
  Save,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  createSetting,
  getPromptDefaults,
  listSettings,
  updateSetting,
  type PromptDefaults,
  type Setting,
} from '@/lib/admin'
import { SettingHistoryDialog } from '@/components/admin/setting-history-dialog'
import { bcp47, fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'

const MAX_LENGTH = 8000

type PromptKey = 'trip.plannerSystemPrompt' | 'trip.composerSystemPrompt'

// Title / stage / note resolve via `t.admin.prompts.list` keyed on `metaKey`.
const PROMPTS: Array<{
  key: PromptKey
  defaultsKey: keyof PromptDefaults
  metaKey: 'keyword' | 'compose'
  icon: LucideIcon
}> = [
  {
    key: 'trip.plannerSystemPrompt',
    defaultsKey: 'planner',
    metaKey: 'keyword',
    icon: BrainCircuit,
  },
  {
    key: 'trip.composerSystemPrompt',
    defaultsKey: 'composer',
    metaKey: 'compose',
    icon: Wand2,
  },
]

export default function AdminPromptsPage() {
  const { t, locale } = useLanguage()
  const promptMeta = (metaKey: 'keyword' | 'compose') =>
    metaKey === 'keyword'
      ? {
          title: t.admin.prompts.list.keywordTitle,
          stage: t.admin.prompts.list.keywordStage,
          note: t.admin.prompts.list.keywordNote,
        }
      : {
          title: t.admin.prompts.list.composeTitle,
          stage: t.admin.prompts.list.composeStage,
          note: t.admin.prompts.list.composeNote,
        }
  const [settings, setSettings] = useState<Map<string, Setting>>(new Map())
  const [defaults, setDefaults] = useState<PromptDefaults | null>(null)
  const [drafts, setDrafts] = useState<Record<PromptKey, string>>({
    'trip.plannerSystemPrompt': '',
    'trip.composerSystemPrompt': '',
  })
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<PromptKey | null>(null)
  const [historyKey, setHistoryKey] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, promptDefaults] = await Promise.all([
        listSettings(),
        getPromptDefaults(),
      ])
      const byKey = new Map(rows.map((row) => [row.key, row]))
      setSettings(byKey)
      setDefaults(promptDefaults)
      setDrafts({
        'trip.plannerSystemPrompt':
          byKey.get('trip.plannerSystemPrompt')?.value ?? promptDefaults.planner,
        'trip.composerSystemPrompt':
          byKey.get('trip.composerSystemPrompt')?.value ??
          promptDefaults.composer,
      })
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSave = async (prompt: (typeof PROMPTS)[number]) => {
    const value = drafts[prompt.key].trim()
    const title = promptMeta(prompt.metaKey).title
    if (!value) {
      toast.error(t.admin.prompts.emptyError)
      return
    }
    if (value.length > MAX_LENGTH) {
      toast.error(fmt(t.admin.prompts.tooLong, { max: MAX_LENGTH }))
      return
    }

    setSavingKey(prompt.key)
    try {
      const existing = settings.get(prompt.key)
      if (existing) {
        await updateSetting(prompt.key, { value, valueType: 'string' })
      } else {
        await createSetting({
          key: prompt.key,
          value,
          valueType: 'string',
          description: fmt(t.admin.prompts.maintainedBy, { title }),
        })
      }
      toast.success(fmt(t.admin.prompts.saved, { title }))
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSavingKey(null)
    }
  }

  const handleReset = (prompt: (typeof PROMPTS)[number]) => {
    if (!defaults) return
    setDrafts((prev) => ({
      ...prev,
      [prompt.key]: defaults[prompt.defaultsKey],
    }))
    toast.info(t.admin.prompts.loadedDefault)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t.common.loading}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.admin.prompts.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.admin.prompts.subtitle}
        </p>
      </div>

      {PROMPTS.map((prompt) => {
        const saved =
          settings.get(prompt.key)?.value ?? defaults?.[prompt.defaultsKey] ?? ''
        const draft = drafts[prompt.key]
        const dirty = draft !== saved
        const isDefault = defaults ? draft === defaults[prompt.defaultsKey] : false
        const updatedAt = settings.get(prompt.key)?.updatedAt
        const meta = promptMeta(prompt.metaKey)

        return (
          <Card key={prompt.key} className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <prompt.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{meta.title}</h2>
                    <Badge variant="outline">{meta.stage}</Badge>
                    {isDefault && <Badge variant="secondary">{t.admin.prompts.builtinDefault}</Badge>}
                    {dirty && (
                      <Badge className="bg-accent text-accent-foreground">
                        {t.admin.prompts.unsaved}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {meta.note}
                  </p>
                </div>
              </div>
              <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                {prompt.key}
              </code>
            </div>

            <Textarea
              value={draft}
              rows={12}
              spellCheck={false}
              className="mt-4 min-h-48 font-mono text-sm leading-relaxed"
              onChange={(event) =>
                setDrafts((prev) => ({
                  ...prev,
                  [prompt.key]: event.target.value,
                }))
              }
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                {fmt(t.admin.prompts.charCount, {
                  current: draft.length.toLocaleString(),
                  max: MAX_LENGTH.toLocaleString(),
                })}
                {updatedAt &&
                  fmt(t.admin.prompts.lastUpdated, {
                    time: new Date(updatedAt).toLocaleString(bcp47(locale)),
                  })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryKey(prompt.key)}
                >
                  <History className="h-4 w-4" />
                  {t.admin.prompts.history}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isDefault || savingKey !== null}
                  onClick={() => handleReset(prompt)}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t.admin.prompts.restoreDefault}
                </Button>
                <Button
                  size="sm"
                  disabled={!dirty || savingKey !== null}
                  onClick={() => void handleSave(prompt)}
                >
                  <Save className="h-4 w-4" />
                  {savingKey === prompt.key ? t.common.saving : t.common.save}
                </Button>
              </div>
            </div>
          </Card>
        )
      })}

      <SettingHistoryDialog
        settingKey={historyKey}
        onClose={() => setHistoryKey(null)}
        onReverted={refresh}
      />
    </div>
  )
}
