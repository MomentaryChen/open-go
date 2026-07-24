import { zh, type Dictionary } from './dictionaries/zh'
import { en } from './dictionaries/en'

export type { Dictionary }
export type Locale = 'zh' | 'en'

export const LOCALES: Locale[] = ['zh', 'en']
export const DEFAULT_LOCALE: Locale = 'zh'
export const LOCALE_COOKIE = 'opengo_locale'

const DICTIONARIES: Record<Locale, Dictionary> = { zh, en }

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'zh' || value === 'en'
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
}

/**
 * Replace `{name}` tokens in a template with the provided values. Keeping
 * interpolation in one helper is what lets the dictionaries store word-order
 * as data — the caller never concatenates translated fragments.
 */
export function fmt(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  )
}

/** BCP-47 tag for `toLocaleString`/`<html lang>` etc. */
export function bcp47(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'zh-TW'
}

/**
 * Read the active locale from the cookie in the browser. For plain client-side
 * helpers (e.g. `lib/admin`, `lib/trip-history`) that produce user-visible text
 * but cannot use the React context. Falls back to the default on the server.
 */
export function getClientLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]+)`),
  )
  return isLocale(match?.[1]) ? (match[1] as Locale) : DEFAULT_LOCALE
}
