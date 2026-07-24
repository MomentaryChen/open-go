import { NextResponse } from 'next/server'
import { getDictionary } from '@/lib/i18n'
import { getServerLocale } from '@/lib/i18n/server'
import { serverApiBaseUrl } from '@/lib/server-api'

/** Server-side base URL for the NestJS backend. See lib/server-api.ts. */
export const backendBaseUrl = serverApiBaseUrl

/**
 * Forwards an admin request to the backend with the shared secret attached.
 * The secret never leaves the server: the browser only ever holds the login
 * cookie, which the middleware has already verified before this runs.
 */
export async function forwardToBackend(
  url: string,
  init: { method: string; body?: string },
) {
  let response: Response
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': process.env.ADMIN_PASSWORD || '',
      },
      body: init.body,
      cache: 'no-store',
    })
  } catch {
    const e = getDictionary(await getServerLocale()).admin.apiErrors
    return NextResponse.json(
      { message: e.backendUnreachable },
      { status: 502 },
    )
  }

  const text = await response.text()
  try {
    return NextResponse.json(JSON.parse(text), { status: response.status })
  } catch {
    return new NextResponse(text, { status: response.status })
  }
}
