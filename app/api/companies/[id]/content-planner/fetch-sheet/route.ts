import { NextResponse } from 'next/server'

const ALLOWED_ORIGIN = 'https://opensheet.elk.sh'

/**
 * GET ?url=<encoded-url>
 * Fetches JSON from OpenSheet URL (opensheet.elk.sh) to avoid CORS.
 * Only allows opensheet.elk.sh URLs.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawUrl = searchParams.get('url')
    if (!rawUrl) {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
    }
    const url = decodeURIComponent(rawUrl.trim())
    if (!url.startsWith(ALLOWED_ORIGIN)) {
      return NextResponse.json(
        { error: 'Only OpenSheet URLs (https://opensheet.elk.sh/...) are allowed' },
        { status: 400 }
      )
    }
    const res = await fetch(url, { next: { revalidate: 0 } })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Sheet fetch failed: ${res.statusText}` },
        { status: res.status }
      )
    }
    const data = await res.json()
    if (!Array.isArray(data)) {
      return NextResponse.json({ error: 'Sheet did not return an array of rows' }, { status: 400 })
    }
    return NextResponse.json(data)
  } catch (e: unknown) {
    const err = e as { message?: string }
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch sheet' },
      { status: 500 }
    )
  }
}
