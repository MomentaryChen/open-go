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

const MAX_LENGTH = 8000

type PromptKey = 'trip.plannerSystemPrompt' | 'trip.composerSystemPrompt'

const PROMPTS: Array<{
  key: PromptKey
  defaultsKey: keyof PromptDefaults
  title: string
  stage: string
  icon: LucideIcon
  note: string
}> = [
  {
    key: 'trip.plannerSystemPrompt',
    defaultsKey: 'planner',
    title: '關鍵字規劃 Prompt',
    stage: 'Pipeline 第 1 步',
    icon: BrainCircuit,
    note: '控制關鍵字如何被拆解成搜尋查詢：查詢數量、語言組合、查詢風格。',
  },
  {
    key: 'trip.composerSystemPrompt',
    defaultsKey: 'composer',
    title: '行程組合 Prompt',
    stage: 'Pipeline 最終步',
    icon: Wand2,
    note: '控制行程的編排規則：引用來源、地理動線、餐食安排。輸出語言規則由系統自動附加，不需要在此撰寫。',
  },
]

export default function AdminPromptsPage() {
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
    if (!value) {
      toast.error('Prompt 不可為空白；若要恢復預設請按「恢復預設」再儲存')
      return
    }
    if (value.length > MAX_LENGTH) {
      toast.error(`Prompt 不可超過 ${MAX_LENGTH} 字元`)
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
          description: `${prompt.title}（由 Prompt 管理頁維護）`,
        })
      }
      toast.success(`已儲存 ${prompt.title}，下一個任務即套用`)
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
    toast.info('已帶入內建預設，按「儲存」後生效')
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Prompt 管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          控制行程產生流程中兩次 LLM 呼叫的 System Prompt。儲存後不需重啟，
          下一個任務（約 30 秒內）即會套用。
        </p>
      </div>

      {PROMPTS.map((prompt) => {
        const saved =
          settings.get(prompt.key)?.value ?? defaults?.[prompt.defaultsKey] ?? ''
        const draft = drafts[prompt.key]
        const dirty = draft !== saved
        const isDefault = defaults ? draft === defaults[prompt.defaultsKey] : false
        const updatedAt = settings.get(prompt.key)?.updatedAt

        return (
          <Card key={prompt.key} className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <prompt.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{prompt.title}</h2>
                    <Badge variant="outline">{prompt.stage}</Badge>
                    {isDefault && <Badge variant="secondary">內建預設</Badge>}
                    {dirty && (
                      <Badge className="bg-accent text-accent-foreground">
                        未儲存
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {prompt.note}
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
                {draft.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()} 字元
                {updatedAt &&
                  ` · 上次更新：${new Date(updatedAt).toLocaleString('zh-TW')}`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryKey(prompt.key)}
                >
                  <History className="h-4 w-4" />
                  歷史版本
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isDefault || savingKey !== null}
                  onClick={() => handleReset(prompt)}
                >
                  <RotateCcw className="h-4 w-4" />
                  恢復預設
                </Button>
                <Button
                  size="sm"
                  disabled={!dirty || savingKey !== null}
                  onClick={() => void handleSave(prompt)}
                >
                  <Save className="h-4 w-4" />
                  {savingKey === prompt.key ? '儲存中…' : '儲存'}
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
