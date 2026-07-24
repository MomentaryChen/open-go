export type LlmProvider = 'gemini' | 'anthropic';

// `||` rather than `??`: docker-compose passes unset variables through as "".
const requestedProvider = (
  process.env.TRIP_LLM_PROVIDER || 'gemini'
).toLowerCase();
const provider: LlmProvider =
  requestedProvider === 'anthropic' || requestedProvider === 'gemini'
    ? requestedProvider
    : 'gemini';

const DEFAULT_MODEL: Record<LlmProvider, string> = {
  // Alias tracking the current flash model: Google closes older pinned models
  // to new API users (gemini-2.5-flash now 404s for them).
  gemini: 'gemini-flash-latest',
  anthropic: 'claude-opus-4-8',
};

/**
 * Model to use for a provider when no explicit model is configured: the
 * TRIP_MODEL env override if set, otherwise that provider's default. Used by
 * the LLM router so switching providers via settings never keeps a model
 * belonging to the other provider.
 */
export function defaultModelFor(provider: LlmProvider): string {
  return process.env.TRIP_MODEL || DEFAULT_MODEL[provider];
}

/** Normalize a provider name; returns null for unknown values. */
export function parseLlmProvider(raw: string): LlmProvider | null {
  const value = raw.trim().toLowerCase();
  return value === 'anthropic' || value === 'gemini' ? value : null;
}

export const tripConfig = {
  targetDocuments: Number(process.env.TRIP_TARGET_DOCUMENTS ?? 30),
  crawlConcurrency: Number(process.env.TRIP_CRAWL_CONCURRENCY ?? 5),
  /**
   * Whole pipelines allowed to run at once. Each one costs several LLM calls
   * plus `crawlConcurrency` parallel fetches, so this is the real ceiling on
   * load; the rest queue.
   */
  maxConcurrentJobs: Number(process.env.TRIP_MAX_CONCURRENT_JOBS || 3),
  /** Days a finished job satisfies the same keyword again; 0 disables the cache. */
  cacheTtlDays: Number(process.env.TRIP_CACHE_TTL_DAYS || 7),
  llmProvider: provider,
  /** What the operator asked for, so an unknown value can be reported. */
  requestedLlmProvider: requestedProvider,
  model: process.env.TRIP_MODEL || DEFAULT_MODEL[provider],
  /** Max characters of extracted body text stored per document. */
  maxDocumentChars: 12000,
  /** Max characters of a single document handed to the composer prompt. */
  maxPromptCharsPerDocument: 6000,
  /** Max total characters of document text handed to the composer prompt. */
  maxPromptCharsTotal: 240000,
  /** Max results taken from a single search query. */
  resultsPerQuery: 12,
  /** Max documents allowed from the same host, to keep sources diverse. */
  maxDocumentsPerHost: 3,
  /** Google only serves results to a real browser; set false to force the fallback engine. */
  useBrowserSearch: process.env.TRIP_SEARCH_BROWSER !== 'false',
  browserHeadless: process.env.TRIP_BROWSER_HEADLESS !== 'false',
  fetchTimeoutMs: 10000,
  maxResponseBytes: 2 * 1024 * 1024,
  /**
   * Kept in step with the bundled Playwright Chromium major version: the browser
   * context overrides its native UA (which advertises "HeadlessChrome") with this
   * one, and a version mismatch is itself a bot signal.
   */
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
};
