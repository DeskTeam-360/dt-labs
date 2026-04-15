import { NextRequest, NextResponse } from 'next/server'

const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN || ''
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY || ''

function getAuthHeader(): string {
  // Freshdesk: Basic auth with API key as username, "X" as password
  const encoded = Buffer.from(`${FRESHDESK_API_KEY}:X`, 'utf-8').toString('base64')
  return `Basic ${encoded}`
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  if (!FRESHDESK_DOMAIN || !FRESHDESK_API_KEY) {
    return NextResponse.json(
      {
        error:
          'Freshdesk is not configured. Set FRESHDESK_DOMAIN and FRESHDESK_API_KEY in .env.local',
      },
      { status: 503 }
    )
  }

  const { path } = await context.params
  const pathSegment = Array.isArray(path) ? path.join('/') : ''
  const url = new URL(_request.url)
  const queryString = url.searchParams.toString()
  const baseUrl = `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2/${pathSegment}`
  const fullUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl

  try {
    const res = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: getAuthHeader(),
      },
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
