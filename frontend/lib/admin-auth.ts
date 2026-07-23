export const ADMIN_COOKIE = 'go1_admin'

/**
 * Cookie value proving the admin password was presented: a salted SHA-256 of
 * ADMIN_PASSWORD, so the plaintext never reaches the browser. Computed with
 * Web Crypto so it runs on both the edge (middleware) and node runtimes.
 * Returns null when the password is not configured — callers must fail closed.
 */
export async function adminCookieValue(): Promise<string | null> {
  // `||` rather than `??`: docker-compose passes unset variables through as "".
  const password = process.env.ADMIN_PASSWORD || ''
  if (!password) return null

  const data = new TextEncoder().encode(`go-one-admin:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
