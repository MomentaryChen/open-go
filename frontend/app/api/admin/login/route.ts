import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, adminCookieValue } from '@/lib/admin-auth'

export async function POST(request: NextRequest) {
  // `||` rather than `??`: docker-compose passes unset variables through as "".
  const password = process.env.ADMIN_PASSWORD || ''
  if (!password) {
    return NextResponse.json(
      { message: '尚未設定 ADMIN_PASSWORD，請先在環境變數中設定' },
      { status: 503 },
    )
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: '請輸入密碼' }, { status: 400 })
  }

  if (body?.password !== password) {
    return NextResponse.json({ message: '密碼錯誤' }, { status: 401 })
  }

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
