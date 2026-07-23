'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
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
import {
  createSetting,
  deleteSetting,
  listSettings,
  updateSetting,
  type Setting,
  type SettingInput,
} from '@/lib/admin'
import { LlmSettingsCard } from '@/components/admin/llm-settings-card'

const KEY_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/

const EMPTY_FORM: SettingInput = {
  key: '',
  value: '',
  valueType: 'string',
  description: '',
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [form, setForm] = useState<SettingInput>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Setting | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setSettings(await listSettings())
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openCreate = () => {
    setEditingKey(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setDialogOpen(true)
  }

  const openEdit = (setting: Setting) => {
    setEditingKey(setting.key)
    setForm({
      key: setting.key,
      value: setting.value,
      valueType: setting.valueType,
      description: setting.description ?? '',
    })
    setFormError(null)
    setDialogOpen(true)
  }

  const validate = (): string | null => {
    if (!editingKey && !KEY_PATTERN.test(form.key.trim())) {
      return 'key 只能包含英數字與 . _ -（最多 100 字元）'
    }
    const value = form.value.trim()
    if (!value) return '請輸入 value'
    if (form.valueType === 'number' && !Number.isFinite(Number(value))) {
      return 'value 必須是有效數字'
    }
    if (form.valueType === 'boolean' && value !== 'true' && value !== 'false') {
      return 'value 必須是 true 或 false'
    }
    return null
  }

  const handleSave = async () => {
    const error = validate()
    if (error) {
      setFormError(error)
      return
    }

    setSaving(true)
    try {
      const input = {
        value: form.value.trim(),
        valueType: form.valueType,
        description: form.description || undefined,
      }
      if (editingKey) {
        await updateSetting(editingKey, input)
        toast.success(`已更新 ${editingKey}`)
      } else {
        await createSetting({ ...input, key: form.key.trim() })
        toast.success(`已新增 ${form.key.trim()}`)
      }
      setDialogOpen(false)
      await refresh()
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteSetting(deleteTarget.key)
      toast.success(`已刪除 ${deleteTarget.key}`)
      setDeleteTarget(null)
      await refresh()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">系統設定</h1>
          <p className="text-sm text-muted-foreground">
            DB 設定值優先於環境變數；trip.* 設定會即時影響行程產生流程
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            重新整理
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新增設定
          </Button>
        </div>
      </div>

      <LlmSettingsCard settings={settings} onSaved={refresh} />

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>型別</TableHead>
              <TableHead className="hidden md:table-cell">說明</TableHead>
              <TableHead className="hidden lg:table-cell">更新時間</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  載入中…
                </TableCell>
              </TableRow>
            ) : settings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  尚無設定，點「新增設定」建立第一筆
                </TableCell>
              </TableRow>
            ) : (
              settings.map((setting) => (
                <TableRow key={setting.id}>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-2">
                      {setting.key}
                      {setting.key.startsWith('trip.') && (
                        <Badge variant="secondary">pipeline</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-sm">
                    {setting.value}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{setting.valueType}</Badge>
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate text-sm text-muted-foreground md:table-cell">
                    {setting.description}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {new Date(setting.updatedAt).toLocaleString('zh-TW')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(setting)}
                      aria-label={`編輯 ${setting.key}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(setting)}
                      aria-label={`刪除 ${setting.key}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingKey ? `編輯 ${editingKey}` : '新增設定'}</DialogTitle>
            <DialogDescription>
              {editingKey
                ? '修改設定值後，下一個任務即會套用新設定'
                : '例如 trip.targetDocuments = 30（每次抓取 30 篇資料）'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setting-key">Key</Label>
              <Input
                id="setting-key"
                value={form.key}
                disabled={!!editingKey}
                placeholder="trip.targetDocuments"
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, key: event.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div
                className={cn(
                  'space-y-2',
                  form.valueType === 'string' && 'col-span-2',
                )}
              >
                <Label htmlFor="setting-value">Value</Label>
                {/* String values include multi-line LLM system prompts. */}
                {form.valueType === 'string' ? (
                  <Textarea
                    id="setting-value"
                    value={form.value}
                    className="max-h-64 font-mono text-sm"
                    rows={form.value.includes('\n') ? 10 : 2}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        value: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    id="setting-value"
                    value={form.value}
                    placeholder={form.valueType === 'number' ? '30' : ''}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        value: event.target.value,
                      }))
                    }
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>型別</Label>
                <Select
                  value={form.valueType}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      valueType: value as SettingInput['valueType'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">string</SelectItem>
                    <SelectItem value="number">number</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="setting-description">說明（選填）</Label>
              <Input
                id="setting-description"
                value={form.description ?? ''}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? '儲存中…' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除 {deleteTarget?.key}？</AlertDialogTitle>
            <AlertDialogDescription>
              刪除後系統會改用環境變數 / 預設值，此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
