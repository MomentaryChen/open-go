import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, adminCookieValue } from '@/lib/admin-auth'
import { fmt, getDictionary } from '@/lib/i18n'
import { getServerLocale } from '@/lib/i18n/server'
import {
  checkLockout,
  clientKey,
  failureDelay,
  recordFailure,
  recordSuccess,
  remainingAttempts,
  secretsMatch,
} from '@/lib/login-rate-limit'

export async function POST(request: NextRequest) {
  const e = getDictionary(await getServerLocale()).admin.apiErrors
  // `||` rather than `??`: docker-compose passes unset variables through as "".
  const password = process.env.ADMIN_PASSWORD || ''
  if (!password) {
    return NextResponse.json({ message: e.adminPasswordNotSet }, { status: 503 })
  }

  const key = clientKey(request.headers)

  const lockout = checkLockout(key)
  if (lockout.locked) {
    return NextResponse.json(
      {
        message: fmt(e.tooManyRetry, {
          minutes: Math.ceil(lockout.retryAfterSeconds / 60),
        }),
      },
      { status: 429, headers: { 'Retry-After': String(lockout.retryAfterSeconds) } },
    )
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: e.passwordRequired }, { status: 400 })
  }

  if (!secretsMatch(body?.password, password)) {
    // Slow every wrong guess down before answering, then report the result.
    await failureDelay()
    const tripped = recordFailure(key)
    if (tripped.locked) {
      return NextResponse.json(
        { message: e.accountLocked },
        {
          status: 429,
          headers: { 'Retry-After': String(tripped.retryAfterSeconds) },
        },
      )
    }
    const left = remainingAttempts(key)
    return NextResponse.json(
      { message: fmt(e.wrongPassword, { left }) },
      { status: 401 },
    )
  }

  recordSuccess(key)

  const cookieValue = await adminCookieValue()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE, cookieValue!, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return response
}

/** Logout: clear the admin cookie. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
