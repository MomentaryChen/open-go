import { NextResponse } from 'next/server'

/**
 * Server-side base URL for the NestJS backend. In docker the browser-facing
 * NEXT_PUBLIC_API_BASE_URL (host port) is unreachable from the frontend
 * container, so BACKEND_INTERNAL_URL (service DNS) takes precedence.
 * `||` rather than `??`: docker-compose passes unset variables through as "".
 */
export function backendBaseUrl() {
  return (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://localhost:33000'
  )
}

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
    return NextResponse.json(
      { message: '無法連線到後端服務' },
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
