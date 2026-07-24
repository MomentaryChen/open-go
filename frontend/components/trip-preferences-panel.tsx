'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Sliders, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  BUDGET_OPTIONS,
  COMPANION_OPTIONS,
  countTripPreferences,
  DURATION_OPTIONS,
  EMPTY_TRIP_PREFERENCES,
  PACE_OPTIONS,
  type TripPreferences,
} from '@/lib/trip'

type Props = {
  value: TripPreferences
  onChange: (next: TripPreferences) => void
  disabled?: boolean
}

const MAX_TAGS = 20
const MAX_TAG_LENGTH = 100
const MAX_DAYS = 30

/**
 * Optional structured overrides shown under the search box. Every field starts
 * empty; an unset field is left for the pipeline to infer from the keyword, so
 * the traveller only pins down what they actually care about.
 */
export function TripPreferencesPanel({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const count = countTripPreferences(value)
  const update = (patch: Partial<TripPreferences>) =>
    onChange({ ...value, ...patch })

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <Sliders className="h-4 w-4" />
            進階偏好
            {count > 0 && (
              <Badge variant="secondary" className="ml-0.5">
                {count}
              </Badge>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                open && 'rotate-180',
              )}
            />
          </Button>
        </CollapsibleTrigger>
        {count > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(EMPTY_TRIP_PREFERENCES)}
            className="text-muted-foreground hover:text-foreground"
          >
            清除
          </Button>
        )}
      </div>

      <CollapsibleContent className="mt-3">
        <div className="grid gap-5 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur sm:p-5">
          {/* 天數 — quick chips plus a free number field for anything else. */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">天數</Label>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                disabled={disabled}
                value={
                  value.durationDays != null &&
                  DURATION_OPTIONS.includes(value.durationDays)
                    ? String(value.durationDays)
                    : ''
                }
                onValueChange={(v) =>
                  update({ durationDays: v ? Number(v) : null })
                }
              >
                {DURATION_OPTIONS.map((d) => (
                  <ToggleGroupItem key={d} value={String(d)} className="px-3">
                    {d} 天
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={MAX_DAYS}
                  inputMode="numeric"
                  aria-label="自訂天數"
                  placeholder="自訂"
                  disabled={disabled}
                  value={value.durationDays ?? ''}
                  onChange={(e) => {
                    if (e.target.value === '') {
                      update({ durationDays: null })
                      return
                    }
                    const n = Number(e.target.value)
                    if (Number.isNaN(n)) return
                    update({
                      durationDays: Math.min(MAX_DAYS, Math.max(1, Math.round(n))),
                    })
                  }}
                  className="h-9 w-20"
                />
                <span className="text-sm text-muted-foreground">天</span>
              </div>
            </div>
          </div>

          <ChipRow
            label="同行類型"
            options={COMPANION_OPTIONS}
            value={value.companions}
            disabled={disabled}
            onChange={(companions) => update({ companions })}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <ChipRow
              label="節奏"
              options={PACE_OPTIONS}
              value={value.pace}
              disabled={disabled}
              onChange={(pace) => update({ pace })}
            />
            <ChipRow
              label="預算"
              options={BUDGET_OPTIONS}
              value={value.budget}
              disabled={disabled}
              onChange={(budget) => update({ budget })}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TagField
              id="pref-must-visit"
              label="想去"
              placeholder="輸入地點後按 Enter"
              tone="positive"
              values={value.mustVisit}
              disabled={disabled}
              onChange={(mustVisit) => update({ mustVisit })}
            />
            <TagField
              id="pref-avoid"
              label="不想去"
              placeholder="輸入地點後按 Enter"
              tone="negative"
              values={value.avoid}
              disabled={disabled}
              onChange={(avoid) => update({ avoid })}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            未填的項目會交給 AI 依關鍵字判斷。
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A single-select segmented row that clears when the active option is re-tapped. */
function ChipRow<T extends string>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T | null
  disabled?: boolean
  onChange: (next: T | null) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        disabled={disabled}
        value={value ?? ''}
        onValueChange={(v) => onChange((v || null) as T | null)}
        className="flex-wrap justify-start"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="px-3">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** Free-text tag entry: Enter / comma adds, Backspace on an empty box removes the last. */
function TagField({
  id,
  label,
  placeholder,
  tone,
  values,
  disabled,
  onChange,
}: {
  id: string
  label: string
  placeholder: string
  tone: 'positive' | 'negative'
  values: string[]
  disabled?: boolean
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const trimmed = draft.trim().slice(0, MAX_TAG_LENGTH)
    if (!trimmed || values.length >= MAX_TAGS) {
      setDraft('')
      return
    }
    if (values.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, trimmed])
    setDraft('')
  }

  const remove = (tag: string) => onChange(values.filter((v) => v !== tag))

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add()
            } else if (e.key === 'Backspace' && !draft && values.length) {
              remove(values[values.length - 1])
            }
          }}
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          disabled={disabled || !draft.trim()}
          onClick={add}
        >
          <Plus className="h-4 w-4" />
          加入
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((tag) => (
            <Badge
              key={tag}
              variant={tone === 'positive' ? 'secondary' : 'outline'}
              className={cn(
                'gap-1 py-1 pl-2.5 pr-1',
                tone === 'negative' && 'border-destructive/40 text-muted-foreground',
              )}
            >
              {tag}
              <button
                type="button"
                aria-label={`移除 ${tag}`}
                disabled={disabled}
                onClick={() => remove(tag)}
                className="rounded-full p-0.5 transition-colors hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
