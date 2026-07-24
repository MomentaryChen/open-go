'use client'

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  LOCALE_COOKIE,
  getDictionary,
  type Dictionary,
  type Locale,
} from './index'

type LanguageContextValue = {
  locale: Locale
  /** The active dictionary — access static strings as `t.namespace.key`. */
  t: Dictionary
  setLocale: (locale: Locale) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

/** Persist the choice for a year so it survives reloads and new tabs. */
function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
}

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: ReactNode
}) {
  const router = useRouter()
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return
      writeLocaleCookie(next)
      setLocaleState(next)
      // Server components (metadata, explore, /trip/[id]) read the cookie, so
      // re-fetch them to re-render in the new language.
      router.refresh()
    },
    [locale, router],
  )

  return (
    <LanguageContext.Provider
      value={{ locale, t: getDictionary(locale), setLocale }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return ctx
}
