'use client'

import { Languages } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'

/**
 * Language switch (中文 ↔ EN). No mount guard is needed: the provider is seeded
 * with the same cookie-derived locale on server and client, so the first paint
 * agrees. Toggling writes the cookie and refreshes server components.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useLanguage()
  const next = locale === 'zh' ? 'en' : 'zh'

  return (
    <button
      type="button"
      aria-label={next === 'en' ? t.language.switchToEn : t.language.switchToZh}
      title={next === 'en' ? t.language.switchToEn : t.language.switchToZh}
      onClick={() => setLocale(next)}
      className={[
        'inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3',
        'bg-card/70 text-sm font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors',
        'hover:border-primary/40 hover:text-primary',
        className ?? '',
      ].join(' ')}
    >
      <Languages className="h-4 w-4" />
      <span>{locale === 'zh' ? t.language.zh : t.language.en}</span>
    </button>
  )
}
