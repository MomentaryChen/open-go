import { NextRequest, NextResponse } from 'next/server'
import { backendBaseUrl, forwardToBackend } from '../backend'

export async function GET() {
  return forwardToBackend(`${backendBaseUrl()}/settings`, { method: 'GET' })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  return forwardToBackend(`${backendBaseUrl()}/settings`, {
    method: 'POST',
    body,
  })
}
