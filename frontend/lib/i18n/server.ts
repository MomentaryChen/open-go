import { cookies } from 'next/headers'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getDictionary,
  isLocale,
  type Locale,
} from './index'

/**
 * Read the active locale from the request cookie. Server-only (uses
 * `next/headers`); `cookies()` is async in Next 15+. Falls back to the default
 * when no valid cookie is present — a first visit is Traditional Chinese.
 */
export async function getServerLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export async function getServerDictionary() {
  return getDictionary(await getServerLocale())
}
