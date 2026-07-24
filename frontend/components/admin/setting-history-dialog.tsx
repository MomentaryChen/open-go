'use client'

import { useCallback, useEffect, useState } from 'react'
import { History, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { bcp47, fmt } from '@/lib/i18n'
import { useLanguage } from '@/lib/i18n/context'
import {
  getSettingHistory,
  revertSetting,
  type SettingHistoryEntry,
} from '@/lib/admin'

// Colors per action; labels resolve via `t.admin.settingHistory.action[action]`.
const ACTION_CLASS: Record<SettingHistoryEntry['action'], string> = {
  create: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  update: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  delete: 'bg-destructive/15 text-destructive',
  revert: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
}

/** Long prompt values are unreadable in full; show enough to identify a version. */
const PREVIEW_CHARS = 400

type Props = {
  settingKey: string | null
  onClose: () => void
  onReverted?: () => void | Promise<void>
}

export function SettingHistoryDialog({ settingKey, onClose, onReverted }: Props) {
  const { t, locale } = useLanguage()
  const [entries, setEntries] = useState<SettingHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [revertingId, setRevertingId] = useState<string | null>(null)

  const load = useCallback(async (key: string) => {
    setLoading(true)
    try {
      setEntries(await getSettingHistory(key))
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (settingKey) void load(settingKey)
    else setEntries([])
  }, [settingKey, load])

  const handleRevert = async (entry: SettingHistoryEntry) => {
    if (!settingKey) return
    setRevertingId(entry.id)
    try {
      await revertSetting(settingKey, entry.id)
      toast.success(t.admin.settingHistory.reverted)
      await onReverted?.()
      await load(settingKey)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setRevertingId(null)
    }
  }

  return (
    <Dialog open={!!settingKey} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {t.admin.settingHistory.title}
          </DialogTitle>
          <DialogDescription>
            <code className="font-mono">{settingKey}</code>
            {t.admin.settingHistory.descriptionSuffix}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t.common.loading}</p>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t.admin.settingHistory.empty}
            </p>
          ) : (
            <ol className="space-y-3">
              {entries.map((entry, index) => {
                const restorable = (entry.newValue ?? entry.oldValue) !== null
                return (
                  <li key={entry.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={ACTION_CLASS[entry.action]}>
                          {t.admin.settingHistory.action[entry.action]}
                        </Badge>
                        {index === 0 && (
                          <Badge variant="outline">{t.admin.settingHistory.currentVersion}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString(bcp47(locale), {
                            hour12: false,
                          })}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          index === 0 || !restorable || revertingId !== null
                        }
                        onClick={() => void handleRevert(entry)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {revertingId === entry.id
                          ? t.admin.settingHistory.reverting
                          : t.admin.settingHistory.revert}
                      </Button>
                    </div>

                    {entry.oldValue !== null && (
                      <ValueBlock label={t.admin.settingHistory.before} value={entry.oldValue} muted />
                    )}
                    {entry.newValue !== null ? (
                      <ValueBlock label={t.admin.settingHistory.after} value={entry.newValue} />
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.admin.settingHistory.deletedNote}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function ValueBlock({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  const { t } = useLanguage()
  const truncated = value.length > PREVIEW_CHARS
  return (
    <div className="mt-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <pre
        className={`mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-xs ${
          muted ? 'text-muted-foreground' : ''
        }`}
      >
        {truncated ? `${value.slice(0, PREVIEW_CHARS)}…` : value}
      </pre>
      {truncated && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fmt(t.admin.settingHistory.truncated, { n: value.length.toLocaleString() })}
        </p>
      )}
    </div>
  )
}
