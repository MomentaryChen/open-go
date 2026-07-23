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

export type PromptDefaults = { planner: string; composer: string }

/** Built-in prompt defaults, used by the Prompt editor's reset button. */
export function getPromptDefaults() {
  return request<PromptDefaults>('/api/admin/settings/prompt-defaults')
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
