'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/context'

/**
 * Light/dark switch. The resolved theme is only known in the browser, so the
 * icon renders as a same-sized placeholder until mount — otherwise the server
 * HTML and the first client paint disagree and React warns about it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const { t } = useLanguage()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      aria-label={isDark ? t.theme.toLight : t.theme.toDark}
      title={isDark ? t.theme.light : t.theme.dark}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={[
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border',
        'bg-card/70 text-muted-foreground shadow-sm backdrop-blur transition-colors',
        'hover:border-primary/40 hover:text-primary',
        className ?? '',
      ].join(' ')}
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  )
}
