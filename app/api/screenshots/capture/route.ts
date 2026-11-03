import { and, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { crawlPages, db, screenshots } from '@/lib/db'
import { captureAndSave, deleteWebCapture } from '@/lib/web-capture-store'
import { CaptureError } from '@/lib/web-screenshot'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

const STAFF_ROLES = ['admin', 'operations', 'manager', 'staff']

async function staffSession() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!STAFF_ROLES.includes(((session.user as { role?: string }).role ?? '').toLowerCase())) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

/**
 * POST /api/screenshots/capture { url, device?: 'desktop' | 'mobile', full_page?: boolean, wait_seconds?: number, ticket_id?: number, crawl_session_id?: string }
 * Opens the address in a headless browser on this server and keeps the picture with the other screenshots (staff only).
 * Only public web addresses are allowed; see lib/web-screenshot.ts.
 */
export async function POST(request: Request) {
  const s = await staffSession()
  if (s.error) return s.error

  const b = (await request.json().catch(() => ({}))) as { url?: unknown; device?: unknown; full_page?: unknown; wait_seconds?: unknown; ticket_id?: unknown; crawl_session_id?: unknown }
  const url = String(b.url ?? '').trim()
  if (!url) return NextResponse.json({ error: 'Enter the web address to capture' }, { status: 400 })
  const ticketId = Number.isInteger(Number(b.ticket_id)) && Number(b.ticket_id) > 0 ? Number(b.ticket_id) : null
  const device = b.device === 'mobile' ? 'mobile' : 'desktop'

  // A capture made for a crawl must be a page of that crawl, so its picture can be listed with the crawl.
  const crawlSessionId = String(b.crawl_session_id ?? '')
  if (crawlSessionId) {
    if (!/^[0-9a-f-]{36}$/i.test(crawlSessionId)) return NextResponse.json({ error: 'Invalid crawl' }, { status: 400 })
    const [page] = await db.select({ id: crawlPages.id }).from(crawlPages).where(and(eq(crawlPages.crawlSessionId, crawlSessionId), eq(crawlPages.url, url))).limit(1)
    if (!page) return NextResponse.json({ error: 'That address is not a page of this crawl' }, { status: 400 })
  }

  try {
    const { row, unloadedImages } = await captureAndSave({
      userId: s.userId,
      url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
      device,
      fullPage: b.full_page === true,
      waitSeconds: Number(b.wait_seconds) || 1,
      ticketId,
      crawlSessionId: crawlSessionId || null,
    })
    return NextResponse.json(
      {
        id: row.id,
        file_name: row.fileName,
        file_path: row.filePath,
        file_url: row.fileUrl,
        file_size: row.fileSize ?? 0,
        mime_type: row.mimeType ?? 'image/png',
        ticket_id: row.ticketId,
        title: row.title,
        description: row.description,
        tags: row.tags,
        created_at: row.createdAt?.toISOString() ?? new Date().toISOString(),
        updated_at: row.updatedAt?.toISOString() ?? new Date().toISOString(),
        tickets: null,
        unloaded_images: unloadedImages,
      },
      { status: 201 }
    )
  } catch (e) {
    if (e instanceof CaptureError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[screenshots/capture]', e)
    return NextResponse.json({ error: 'The capture failed' }, { status: 500 })
  }
}

/** GET /api/screenshots/capture?crawl_session_id=... - the pictures taken for one crawl, newest first (staff only). */
export async function GET(request: Request) {
  const s = await staffSession()
  if (s.error) return s.error
  const id = new URL(request.url).searchParams.get('crawl_session_id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid crawl' }, { status: 400 })
  const rows = await db
    .select()
    .from(screenshots)
    .where(sql`${screenshots.tags} @> ARRAY[${`crawl:${id}`}]::text[]`)
    .orderBy(desc(screenshots.createdAt))
  return NextResponse.json({
    screenshots: rows.map((r) => ({
      id: r.id,
      file_url: r.fileUrl,
      title: r.title,
      created_at: r.createdAt?.toISOString() ?? '',
      device: (r.tags ?? []).includes('device:mobile') ? 'mobile' : 'desktop',
      page_url: (r.tags ?? []).find((t) => t.startsWith('src:'))?.slice(4) ?? r.description ?? '',
    })),
  })
}

/** DELETE /api/screenshots/capture?id=... - removes a picture made by a capture (the row and its file), so a bad one can be taken again. */
export async function DELETE(request: Request) {
  const s = await staffSession()
  if (s.error) return s.error
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid picture' }, { status: 400 })
  const result = await deleteWebCapture(id)
  if (result === 'not_found') return NextResponse.json({ error: 'Picture not found' }, { status: 404 })
  if (result === 'not_a_capture') return NextResponse.json({ error: 'Only pictures taken by a capture can be removed here' }, { status: 403 })
  return NextResponse.json({ ok: true })
}
