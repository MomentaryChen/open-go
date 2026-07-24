export type Setting = {
  id: string
  key: string
  value: string
  valueType: 'string' | 'number' | 'boolean'
  description: string | null
  createdAt: string
  updatedAt: string
}

export type SettingInput = {
  key: string
  value: string
  valueType: Setting['valueType']
  description?: string
}

/**
 * Admin API helpers. Calls go to the same-origin /api/admin proxy so the
 * login cookie flows automatically and the backend secret stays server-side.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (response.status === 401) {
    window.location.href = '/admin/login'
    throw new Error('請重新登入')
  }

  const text = await response.text()
  const data = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    const message =
      (data as { message?: string | string[] })?.message ?? '操作失敗'
    throw new Error(Array.isArray(message) ? message.join(', ') : message)
  }
  return data as T
}

export function listSettings() {
  return request<Setting[]>('/api/admin/settings')
}

export function createSetting(input: SettingInput) {
  return request<Setting>('/api/admin/settings', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateSetting(
  key: string,
  input: Omit<SettingInput, 'key'>,
) {
  return request<Setting>(`/api/admin/settings/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteSetting(key: string) {
  return request<{ ok: boolean }>(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    { method: 'DELETE' },
  )
}

export type LlmProviderAvailability = { gemini: boolean; anthropic: boolean }

/** Which LLM providers have an API key configured on the backend. */
export function getLlmProviders() {
  return request<LlmProviderAvailability>('/api/admin/settings/llm-providers')
}

export type PromptDefaults = { planner: string; composer: string }

/** Built-in prompt defaults, used by the Prompt editor's reset button. */
export function getPromptDefaults() {
  return request<PromptDefaults>('/api/admin/settings/prompt-defaults')
}

// ---------------------------------------------------------------------------
// Setting history / rollback
// ---------------------------------------------------------------------------

export type SettingHistoryEntry = {
  id: string
  key: string
  action: 'create' | 'update' | 'delete' | 'revert'
  oldValue: string | null
  newValue: string | null
  valueType: string | null
  description: string | null
  createdAt: string
}

/** Version history for one setting key, newest first. */
export function getSettingHistory(key: string, limit = 50) {
  return request<SettingHistoryEntry[]>(
    `/api/admin/settings/${encodeURIComponent(key)}/history?limit=${limit}`,
  )
}

/** Recent changes across every setting key. */
export function getRecentSettingHistory(limit = 20) {
  return request<SettingHistoryEntry[]>(
    `/api/admin/settings/history?limit=${limit}`,
  )
}

/** Restore the value a history entry recorded. */
export function revertSetting(key: string, historyId: string) {
  return request<Setting>(
    `/api/admin/settings/${encodeURIComponent(key)}/revert/${encodeURIComponent(historyId)}`,
    { method: 'POST' },
  )
}

// ---------------------------------------------------------------------------
// Job monitoring
// ---------------------------------------------------------------------------

export type JobSummary = {
  id: string
  keyword: string
  status: string
  progress: number
  message: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  durationMs: number
  documentCount: number
  queryCount: number
  hasItinerary: boolean
  model: string | null
}

export type JobListResult = {
  total: number
  page: number
  pageSize: number
  items: JobSummary[]
}

export type JobStats = {
  total: number
  byStatus: Record<string, number>
  active: number
  stuck: number
  stuckAfterMinutes: number
  /** Live in-process view: what is executing now vs. waiting for a slot. */
  queue: { running: number; queued: number }
  last24h: {
    total: number
    done: number
    failed: number
    successRate: number | null
    avgDurationMs: number | null
    p95DurationMs: number | null
  }
}

export type JobDocument = {
  id: string
  url: string
  title: string | null
  snippet: string | null
  status: string
  fetchedAt: string | null
}

export type JobDetail = {
  id: string
  keyword: string
  status: string
  progress: number
  message: string | null
  error: string | null
  createdAt: string
  updatedAt: string
  durationMs: number
  documentStats: Record<string, number>
  queries: Array<{
    id: string
    query: string
    intent: string | null
    language: string | null
    resultCount: number
  }>
  documents: JobDocument[]
  itinerary: {
    id: string
    summary: string
    data: unknown
    model: string
    createdAt: string
  } | null
}

export function listJobs(params: {
  status?: string
  keyword?: string
  page?: number
  pageSize?: number
}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.keyword) query.set('keyword', params.keyword)
  query.set('page', String(params.page ?? 1))
  query.set('pageSize', String(params.pageSize ?? 20))
  return request<JobListResult>(`/api/admin/ops/jobs?${query}`)
}

export function getJobStats() {
  return request<JobStats>('/api/admin/ops/jobs/stats')
}

export function getJobDetail(id: string) {
  return request<JobDetail>(`/api/admin/ops/jobs/${encodeURIComponent(id)}`)
}

export function retryJob(id: string) {
  return request<{ jobId: string; keyword: string; status: string }>(
    `/api/admin/ops/jobs/${encodeURIComponent(id)}/retry`,
    { method: 'POST' },
  )
}

export function deleteJob(id: string) {
  return request<{ ok: boolean }>(
    `/api/admin/ops/jobs/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
}

export function failStuckJobs(olderThanMinutes: number) {
  return request<{ updated: number; olderThanMinutes: number }>(
    '/api/admin/ops/jobs/fail-stuck',
    { method: 'POST', body: JSON.stringify({ olderThanMinutes }) },
  )
}

// ---------------------------------------------------------------------------
// Keyword analytics
// ---------------------------------------------------------------------------

export type KeywordStat = {
  keyword: string
  total: number
  done: number
  failed: number
  pending: number
  failureRate: number | null
  avgDocuments: number | null
  lastAt: string
}

export type TrendPoint = {
  day: string
  total: number
  done: number
  failed: number
}

export type ContentGap = {
  keyword: string
  jobs: number
  avgDocuments: number | null
  lastAt: string
}

export type HostStat = {
  host: string
  attempts: number
  fetched: number
  successRate: number
  autoBlocked: boolean
}

export function getKeywordStats(days = 30, limit = 50) {
  return request<KeywordStat[]>(
    `/api/admin/ops/analytics/keywords?days=${days}&limit=${limit}`,
  )
}

export function getJobTrend(days = 30) {
  return request<TrendPoint[]>(`/api/admin/ops/analytics/trend?days=${days}`)
}

export function getContentGaps(days = 30, maxDocuments = 5) {
  return request<ContentGap[]>(
    `/api/admin/ops/analytics/content-gaps?days=${days}&maxDocuments=${maxDocuments}`,
  )
}

export function getHostStats(days = 30) {
  return request<HostStat[]>(`/api/admin/ops/analytics/hosts?days=${days}`)
}

// ---------------------------------------------------------------------------
// Affiliate funnel analytics
// ---------------------------------------------------------------------------

export type AffiliateFunnelCounts = {
  impressions: number
  clicks: number
  redirects: number
  ctr: number | null
  redirectRate: number | null
}

export type AffiliateAnalytics = {
  summary: AffiliateFunnelCounts
  byPartner: Array<AffiliateFunnelCounts & { partner: string }>
  byCategory: Array<AffiliateFunnelCounts & { category: string }>
  trend: Array<{
    day: string
    impressions: number
    clicks: number
    redirects: number
  }>
  recent: Array<{
    id: string
    event: string
    jobId: string | null
    day: number | null
    category: string
    partner: string
    label: string | null
    keyword: string | null
    createdAt: string
  }>
}

export function getAffiliateAnalytics(days = 30, limit = 50) {
  return request<AffiliateAnalytics>(
    `/api/admin/ops/analytics/affiliate?days=${days}&limit=${limit}`,
  )
}

// ---------------------------------------------------------------------------
// Data retention
// ---------------------------------------------------------------------------

export type RetentionResult = {
  contentStripped: number
  jobsDeleted: number
  cacheEntriesDeleted: number
  contentRetentionDays: number
  jobRetentionDays: number
  dryRun: boolean
}

export type RetentionUsage = {
  jobs: number
  documents: number
  documentsWithContent: number
  contentBytes: number
  cacheEntries: number
  expiredCache: number
}

export function getRetentionStatus() {
  return request<{ usage: RetentionUsage; preview: RetentionResult }>(
    '/api/admin/ops/retention',
  )
}

export function runRetention() {
  return request<RetentionResult>('/api/admin/ops/retention/run', {
    method: 'POST',
  })
}

export async function adminLogin(password: string) {
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(data?.message ?? '登入失敗')
  }
}

export async function adminLogout() {
  await fetch('/api/admin/login', { method: 'DELETE' })
}
