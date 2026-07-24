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
import {
  getSettingHistory,
  revertSetting,
  type SettingHistoryEntry,
} from '@/lib/admin'

const ACTION_META: Record<
  SettingHistoryEntry['action'],
  { label: string; className: string }
> = {
  create: { label: '新增', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  update: { label: '修改', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  delete: { label: '刪除', className: 'bg-destructive/15 text-destructive' },
  revert: { label: '還原', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
}

/** Long prompt values are unreadable in full; show enough to identify a version. */
const PREVIEW_CHARS = 400

type Props = {
  settingKey: string | null
  onClose: () => void
  onReverted?: () => void | Promise<void>
}

export function SettingHistoryDialog({ settingKey, onClose, onReverted }: Props) {
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
      toast.success('已還原此版本，下一個任務即套用')
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
            變更紀錄
          </DialogTitle>
          <DialogDescription>
            <code className="font-mono">{settingKey}</code> 的所有變更；
            點「還原」可回到該版本的值，還原動作本身也會被記錄。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">載入中…</p>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              尚無變更紀錄（此設定自稽核功能上線後未被修改過）
            </p>
          ) : (
            <ol className="space-y-3">
              {entries.map((entry, index) => {
                const meta = ACTION_META[entry.action]
                const restorable = (entry.newValue ?? entry.oldValue) !== null
                return (
                  <li key={entry.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={meta.className}>
                          {meta.label}
                        </Badge>
                        {index === 0 && <Badge variant="outline">目前版本</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString('zh-TW', {
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
                        {revertingId === entry.id ? '還原中…' : '還原'}
                      </Button>
                    </div>

                    {entry.oldValue !== null && (
                      <ValueBlock label="變更前" value={entry.oldValue} muted />
                    )}
                    {entry.newValue !== null ? (
                      <ValueBlock label="變更後" value={entry.newValue} />
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        （設定已被刪除）
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
          共 {value.length.toLocaleString()} 字元，已截斷顯示
        </p>
      )}
    </div>
  )
}
