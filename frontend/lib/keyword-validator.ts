/**
 * Client-side keyword validation — mirrors the backend's keyword-validator.ts
 * rules so the user gets instant feedback before a round-trip. The backend
 * remains the authority; this is a convenience guard.
 */

export type KeywordErrorCode =
  | 'KEYWORD_TOO_SHORT'
  | 'KEYWORD_TOO_LONG'
  | 'KEYWORD_HAS_URL'
  | 'KEYWORD_HAS_HTML'
  | 'KEYWORD_NO_WORDS'
  | 'KEYWORD_CONTROL_CHARS'
  | 'KEYWORD_EXCESSIVE_SPECIAL'

const MAX_LENGTH = 200
const MIN_LENGTH = 2

const URL_PATTERN =
  /https?:\/\/|www\.\w|[a-z0-9-]+\.(com|net|org|io|dev|app|tw|jp|kr|cn|uk|de|fr|co)\b/i

const HTML_PATTERN = /<\/?[a-z][a-z0-9]*[\s>]/i

const WORD_CHAR = /[\p{L}\p{Nd}]/u

const CONTROL_CHAR = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/

/**
 * Validate a keyword on the client. Returns `null` when valid, or an error
 * code when the value would be rejected by the backend.
 *
 * Empty / whitespace-only input returns `null` (treated as "nothing typed yet"
 * rather than an error — the submit button is already disabled for empty input).
 */
export function validateKeyword(value: string): KeywordErrorCode | null {
  const trimmed = value.trim()
  if (!trimmed) return null // empty is handled by the disabled submit button

  if (trimmed.length < MIN_LENGTH) return 'KEYWORD_TOO_SHORT'
  if (trimmed.length > MAX_LENGTH) return 'KEYWORD_TOO_LONG'
  if (CONTROL_CHAR.test(trimmed)) return 'KEYWORD_CONTROL_CHARS'
  if (URL_PATTERN.test(trimmed)) return 'KEYWORD_HAS_URL'
  if (HTML_PATTERN.test(trimmed)) return 'KEYWORD_HAS_HTML'

  const nonSpace = trimmed.replace(/\s/g, '')
  const wordChars = [...nonSpace].filter((ch) => WORD_CHAR.test(ch)).length

  if (wordChars === 0) return 'KEYWORD_NO_WORDS'
  if (nonSpace.length >= 4 && wordChars / nonSpace.length < 0.5) return 'KEYWORD_EXCESSIVE_SPECIAL'

  return null
}
