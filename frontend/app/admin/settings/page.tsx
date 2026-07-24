'use client'

import { useCallback, useEffect, useState } from 'react'
import { History, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
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
import { SettingHistoryDialog } from '@/components/admin/setting-history-dialog'
import { RetentionCard } from '@/components/admin/retention-card'
import { bcp47, fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'

const KEY_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/

const EMPTY_FORM: SettingInput = {
  key: '',
  value: '',
  valueType: 'string',
  description: '',
}

export default function AdminSettingsPage() {
  const { t, locale } = useLanguage()
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [form, setForm] = useState<SettingInput>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Setting | null>(null)
  const [historyKey, setHistoryKey] = useState<string | null>(null)

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
      return t.admin.settings.validate.key
    }
    const value = form.value.trim()
    if (!value) return t.admin.settings.validate.valueRequired
    if (form.valueType === 'number' && !Number.isFinite(Number(value))) {
      return t.admin.settings.validate.number
    }
    if (form.valueType === 'boolean' && value !== 'true' && value !== 'false') {
      return t.admin.settings.validate.boolean
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
        toast.success(fmt(t.admin.settings.updated, { key: editingKey }))
      } else {
        await createSetting({ ...input, key: form.key.trim() })
        toast.success(fmt(t.admin.settings.added, { key: form.key.trim() }))
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
      toast.success(fmt(t.admin.settings.deleted, { key: deleteTarget.key }))
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
          <h1 className="text-2xl font-semibold">{t.admin.settings.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.settings.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            {t.common.refresh}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t.admin.settings.addSetting}
          </Button>
        </div>
      </div>

      <LlmSettingsCard settings={settings} onSaved={refresh} />

      <RetentionCard />

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.admin.settings.col.key}</TableHead>
              <TableHead>{t.admin.settings.col.value}</TableHead>
              <TableHead>{t.admin.settings.col.type}</TableHead>
              <TableHead className="hidden md:table-cell">{t.admin.settings.col.description}</TableHead>
              <TableHead className="hidden lg:table-cell">{t.admin.settings.col.updatedAt}</TableHead>
              <TableHead className="w-32 text-right">{t.admin.settings.col.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t.common.loading}
                </TableCell>
              </TableRow>
            ) : settings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t.admin.settings.empty}
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
                    {new Date(setting.updatedAt).toLocaleString(bcp47(locale))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setHistoryKey(setting.key)}
                      aria-label={fmt(t.admin.settings.historyAria, { key: setting.key })}
                      title={t.admin.settings.historyTitle}
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(setting)}
                      aria-label={fmt(t.admin.settings.editAria, { key: setting.key })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(setting)}
                      aria-label={fmt(t.admin.settings.deleteAria, { key: setting.key })}
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
            <DialogTitle>
              {editingKey ? fmt(t.admin.settings.editTitle, { key: editingKey }) : t.admin.settings.addTitle}
            </DialogTitle>
            <DialogDescription>
              {editingKey
                ? t.admin.settings.editDescription
                : t.admin.settings.addDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setting-key">{t.admin.settings.labelKey}</Label>
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
                <Label htmlFor="setting-value">{t.admin.settings.labelValue}</Label>
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
                <Label>{t.admin.settings.labelType}</Label>
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
              <Label htmlFor="setting-description">{t.admin.settings.labelDescription}</Label>
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
              {t.common.cancel}
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingHistoryDialog
        settingKey={historyKey}
        onClose={() => setHistoryKey(null)}
        onReverted={refresh}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {fmt(t.admin.settings.deleteTitle, { key: deleteTarget?.key ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.admin.settings.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
