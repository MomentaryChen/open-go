import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, adminCookieValue } from '@/lib/admin-auth'

/**
 * Gates the admin area. Pages redirect to the login form; API routes get a
 * 401 JSON response. With no ADMIN_PASSWORD configured everything is blocked
 * (fail closed) — the login page itself stays reachable so it can explain.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // The login page and its endpoint must stay reachable while logged out.
  if (pathname === '/admin/login' || pathname === '/api/admin/login') {
    return NextResponse.next()
  }

  const expected = await adminCookieValue()
  const provided = request.cookies.get(ADMIN_COOKIE)?.value

  if (expected && provided === expected) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/admin/login'
  loginUrl.search = ''
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
