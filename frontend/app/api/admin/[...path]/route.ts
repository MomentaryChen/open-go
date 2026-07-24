import { NextRequest, NextResponse } from 'next/server'
import { backendBaseUrl, forwardToBackend } from '../backend'

type Params = { params: Promise<{ path: string[] }> }

/**
 * Catch-all proxy for admin endpoints that don't need bespoke handling
 * (/ops/*, and the nested /settings/:key/history + revert routes). More
 * specific route files still win, so /api/admin/settings and
 * /api/admin/settings/:key keep their dedicated handlers.
 *
 * Only these prefixes are forwarded: the proxy attaches the backend secret,
 * so it must never become a general-purpose tunnel to every backend route.
 */
const ALLOWED_PREFIXES = ['ops', 'settings']

async function proxy(request: NextRequest, params: Params['params'], method: string) {
  const { path } = await params
  if (!path?.length || !ALLOWED_PREFIXES.includes(path[0])) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 })
  }

  const target = path.map(encodeURIComponent).join('/')
  const search = request.nextUrl.search
  const body =
    method === 'GET' || method === 'DELETE' ? undefined : await request.text()

  return forwardToBackend(`${backendBaseUrl()}/${target}${search}`, {
    method,
    body,
  })
}

export async function GET(request: NextRequest, { params }: Params) {
  return proxy(request, params, 'GET')
}

export async function POST(request: NextRequest, { params }: Params) {
  return proxy(request, params, 'POST')
}

export async function PUT(request: NextRequest, { params }: Params) {
  return proxy(request, params, 'PUT')
}

export async function PATCH(request: NextRequest, { params }: Params) {
  return proxy(request, params, 'PATCH')
}

export async function DELETE(request: NextRequest, { params }: Params) {
  return proxy(request, params, 'DELETE')
}
