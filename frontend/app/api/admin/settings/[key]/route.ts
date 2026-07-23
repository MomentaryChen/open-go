import { NextRequest } from 'next/server'
import { backendBaseUrl, forwardToBackend } from '../../backend'

type Params = { params: Promise<{ key: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const { key } = await params
  const body = await request.text()
  return forwardToBackend(
    `${backendBaseUrl()}/settings/${encodeURIComponent(key)}`,
    { method: 'PATCH', body },
  )
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { key } = await params
  return forwardToBackend(
    `${backendBaseUrl()}/settings/${encodeURIComponent(key)}`,
    { method: 'DELETE' },
  )
}
