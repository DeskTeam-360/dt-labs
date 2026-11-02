import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, screenshots } from '@/lib/db'
import { getPublicUrl, uploadBuffer } from '@/lib/storage-idrive'
import { CaptureError, captureWebsite } from '@/lib/web-screenshot'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

const STAFF_ROLES = ['admin', 'operations', 'manager', 'staff']

/**
 * POST /api/screenshots/capture { url, device?: 'desktop' | 'mobile', full_page?: boolean, wait_seconds?: number, ticket_id?: number }
 * Opens the address in a headless browser on this server and keeps the picture with the other screenshots (staff only).
 * Only public web addresses are allowed; see lib/web-screenshot.ts.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!STAFF_ROLES.includes(((session.user as { role?: string }).role ?? '').toLowerCase())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = (await request.json().catch(() => ({}))) as { url?: unknown; device?: unknown; full_page?: unknown; wait_seconds?: unknown; ticket_id?: unknown }
  const url = String(b.url ?? '').trim()
  if (!url) return NextResponse.json({ error: 'Enter the web address to capture' }, { status: 400 })
  const ticketId = Number.isInteger(Number(b.ticket_id)) && Number(b.ticket_id) > 0 ? Number(b.ticket_id) : null

  try {
    const shot = await captureWebsite(/^https?:\/\//i.test(url) ? url : `https://${url}`, {
      device: b.device === 'mobile' ? 'mobile' : 'desktop',
      fullPage: b.full_page === true,
      waitSeconds: Number(b.wait_seconds) || 1,
    })
    const host = new URL(shot.finalUrl).hostname.replace(/[^a-z0-9.-]/gi, '-')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = `screenshots/web-${host}-${stamp}.png`
    const { url: uploaded, error: uploadError } = await uploadBuffer(filePath, shot.png, 'image/png')
    if (uploadError) return NextResponse.json({ error: uploadError }, { status: 500 })

    const [row] = await db
      .insert(screenshots)
      .values({
        userId: session.user.id,
        fileName: filePath.split('/').pop() as string,
        filePath,
        fileUrl: uploaded ?? getPublicUrl(filePath),
        fileSize: shot.png.length,
        mimeType: 'image/png',
        ticketId,
        title: shot.title.slice(0, 255),
        description: shot.finalUrl,
        tags: ['web-capture'],
      })
      .returning()
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
      },
      { status: 201 }
    )
  } catch (e) {
    if (e instanceof CaptureError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[screenshots/capture]', e)
    return NextResponse.json({ error: 'The capture failed' }, { status: 500 })
  }
}
