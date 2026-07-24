/**
 * Input-guard for the trip keyword: rejects values that are clearly not travel
 * queries before the pipeline burns LLM tokens or search quota on them.
 *
 * Dependency-free — importable from the controller and (if wanted) from tests
 * without pulling in Nest modules.
 */

/** Result of a keyword validation check. */
export type KeywordCheckResult =
  | { ok: true }
  | { ok: false; code: KeywordErrorCode; message: string };

export type KeywordErrorCode =
  | 'KEYWORD_REQUIRED'
  | 'KEYWORD_TOO_SHORT'
  | 'KEYWORD_TOO_LONG'
  | 'KEYWORD_HAS_URL'
  | 'KEYWORD_HAS_HTML'
  | 'KEYWORD_NO_WORDS'
  | 'KEYWORD_CONTROL_CHARS'
  | 'KEYWORD_EXCESSIVE_SPECIAL';

const MAX_LENGTH = 200;
const MIN_LENGTH = 2;

/** Matches http(s)://, www., or bare domain-like patterns. */
const URL_PATTERN =
  /https?:\/\/|www\.\w|[a-z0-9-]+\.(com|net|org|io|dev|app|tw|jp|kr|cn|uk|de|fr|co)\b/i;

/** Matches HTML tags or common script/event-handler injections. */
const HTML_PATTERN = /<\/?[a-z][a-z0-9]*[\s>]/i;

/**
 * Unicode word character: any letter (Latin, CJK, Hangul, Kana, Cyrillic, etc.)
 * or a decimal digit. Used to decide whether the input has "real" content.
 */
const WORD_CHAR =
  /[\p{L}\p{Nd}]/u;

/** C0/C1 control characters except common whitespace (tab, LF, CR). */
const CONTROL_CHAR = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;

/**
 * Validate a trip keyword.
 *
 * Returns `{ ok: true }` when the value is acceptable, or
 * `{ ok: false, code, message }` with a machine-readable code and a
 * human-readable (English) explanation otherwise.
 *
 * The caller (controller) maps `code` to a translated user-facing message.
 */
export function validateKeyword(raw: unknown): KeywordCheckResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, code: 'KEYWORD_REQUIRED', message: 'keyword is required' };
  }

  const keyword = raw.trim();

  if (keyword.length < MIN_LENGTH) {
    return {
      ok: false,
      code: 'KEYWORD_TOO_SHORT',
      message: `keyword must be at least ${MIN_LENGTH} characters`,
    };
  }

  if (keyword.length > MAX_LENGTH) {
    return {
      ok: false,
      code: 'KEYWORD_TOO_LONG',
      message: `keyword must be ${MAX_LENGTH} characters or fewer`,
    };
  }

  if (CONTROL_CHAR.test(keyword)) {
    return {
      ok: false,
      code: 'KEYWORD_CONTROL_CHARS',
      message: 'keyword contains invalid control characters',
    };
  }

  if (URL_PATTERN.test(keyword)) {
    return {
      ok: false,
      code: 'KEYWORD_HAS_URL',
      message: 'keyword must not contain URLs',
    };
  }

  if (HTML_PATTERN.test(keyword)) {
    return {
      ok: false,
      code: 'KEYWORD_HAS_HTML',
      message: 'keyword must not contain HTML',
    };
  }

  // Count Unicode word characters vs total (excluding whitespace).
  const nonSpace = keyword.replace(/\s/g, '');
  const wordChars = [...nonSpace].filter((ch) => WORD_CHAR.test(ch)).length;

  if (wordChars === 0) {
    return {
      ok: false,
      code: 'KEYWORD_NO_WORDS',
      message: 'keyword must contain at least one letter or number',
    };
  }

  // If more than half the non-space characters are special symbols, it's
  // likely gibberish, emoji spam, or an injection attempt.
  if (nonSpace.length >= 4 && wordChars / nonSpace.length < 0.5) {
    return {
      ok: false,
      code: 'KEYWORD_EXCESSIVE_SPECIAL',
      message: 'keyword contains too many special characters',
    };
  }

  return { ok: true };
}
