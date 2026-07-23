'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createSetting,
  getLlmProviders,
  updateSetting,
  type LlmProviderAvailability,
  type Setting,
} from '@/lib/admin'

const PROVIDERS = [
  { value: 'gemini', label: 'Gemini（Google）' },
  { value: 'anthropic', label: 'Claude（Anthropic）' },
] as const

const CUSTOM = '__custom__'

/** Preset models per provider; "auto" resolves to the provider default. */
const MODEL_PRESETS: Record<string, { value: string; label: string }[]> = {
  gemini: [
    { value: 'auto', label: 'auto（提供者預設）' },
    { value: 'gemini-flash-latest', label: 'gemini-flash-latest' },
    { value: 'gemini-3.5-flash-lite', label: 'gemini-3.5-flash-lite' },
    { value: 'gemini-3.1-flash-lite', label: 'gemini-3.1-flash-lite' },
  ],
  anthropic: [
    { value: 'auto', label: 'auto（提供者預設）' },
    { value: 'claude-opus-4-8', label: 'claude-opus-4-8' },
    { value: 'claude-sonnet-5', label: 'claude-sonnet-5' },
    { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5' },
  ],
}

const PROVIDER_DEFAULT: Record<string, string> = {
  gemini: 'gemini-flash-latest',
  anthropic: 'claude-opus-4-8',
}

/**
 * Dedicated editor for the trip.llmProvider / trip.llmModel settings, so the
 * LLM choice is visible at a glance instead of buried in the key/value table.
 * Writes through the same settings API; the backend router picks the change
 * up on the next job without a restart.
 */
export function LlmSettingsCard({
  settings,
  onSaved,
}: {
  settings: Setting[]
  onSaved: () => Promise<void>
}) {
  const providerSetting = settings.find((s) => s.key === 'trip.llmProvider')
  const modelSetting = settings.find((s) => s.key === 'trip.llmModel')

  const [provider, setProvider] = useState('gemini')
  // Dropdown pick; CUSTOM switches to the free-text input below.
  const [preset, setPreset] = useState('auto')
  const [customModel, setCustomModel] = useState('')
  const [saving, setSaving] = useState(false)
  // null until loaded; providers without an API key are disabled.
  const [availability, setAvailability] =
    useState<LlmProviderAvailability | null>(null)

  useEffect(() => {
    getLlmProviders()
      .then(setAvailability)
      .catch(() => setAvailability(null))
  }, [])

  const presets = MODEL_PRESETS[provider] ?? [{ value: 'auto', label: 'auto' }]

  // Sync form with server values whenever a refresh lands. A stored model
  // that is not in the preset list shows up as the custom option.
  useEffect(() => {
    const serverProvider = providerSetting?.value ?? 'gemini'
    const serverModel = modelSetting?.value ?? 'auto'
    setProvider(serverProvider)
    const known = (MODEL_PRESETS[serverProvider] ?? []).some(
      (p) => p.value === serverModel,
    )
    setPreset(known ? serverModel : CUSTOM)
    setCustomModel(known ? '' : serverModel)
  }, [providerSetting?.value, modelSetting?.value])

  const model = preset === CUSTOM ? customModel.trim() : preset

  const dirty =
    provider !== (providerSetting?.value ?? 'gemini') ||
    (model !== '' && model !== (modelSetting?.value ?? 'auto'))

  const save = async () => {
    if (preset === CUSTOM && !customModel.trim()) {
      toast.error('請輸入自訂模型名稱')
      return
    }
    setSaving(true)
    try {
      const upsert = (
        existing: Setting | undefined,
        key: string,
        value: string,
        description: string,
      ) =>
        existing
          ? updateSetting(key, { value, valueType: 'string' })
          : createSetting({ key, value, valueType: 'string', description })

      await upsert(
        providerSetting,
        'trip.llmProvider',
        provider,
        'LLM 提供者：gemini 或 anthropic（需設定對應 API key）',
      )
      await upsert(
        modelSetting,
        'trip.llmModel',
        model,
        '模型名稱；auto = 依 provider 預設',
      )
      toast.success('LLM 設定已更新，下一個任務即會套用')
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
          <Sparkles className="h-4 w-4" />
          LLM 模型
        </CardTitle>
        <CardDescription>
          行程產生使用的 LLM；儲存後下一個任務即生效，無需重啟
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>提供者</Label>
            <Select
              value={provider}
              onValueChange={(value) => {
                setProvider(value)
                // Models are provider-specific; switch to that provider's
                // default model so the stored model never lags behind.
                setPreset(PROVIDER_DEFAULT[value] ?? 'auto')
                setCustomModel('')
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(({ value, label }) => {
                  const hasKey = availability?.[value] ?? true
                  return (
                    <SelectItem key={value} value={value} disabled={!hasKey}>
                      {label}
                      {!hasKey && '（未設定 API key）'}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>模型</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-64 font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map(({ value, label }) => (
                  <SelectItem key={value} value={value} className="font-mono">
                    {label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>自訂…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === CUSTOM && (
            <div className="space-y-2">
              <Label htmlFor="llm-custom-model">自訂模型名稱</Label>
              <Input
                id="llm-custom-model"
                className="w-64 font-mono text-sm"
                value={customModel}
                placeholder="輸入模型名稱"
                onChange={(event) => setCustomModel(event.target.value)}
              />
            </div>
          )}
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? '儲存中…' : '儲存'}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          auto = 使用提供者預設模型（目前為 {PROVIDER_DEFAULT[provider]}）
        </p>
        {availability && !availability[provider as keyof typeof availability] && (
          <p className="mt-1 text-xs text-destructive">
            目前選擇的提供者尚未設定 API key，行程任務將會失敗
          </p>
        )}
      </CardContent>
    </Card>
  )
}
