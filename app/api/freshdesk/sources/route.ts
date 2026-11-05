import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { appSettings, db } from '@/lib/db'

/** GET /api/freshdesk/sources — which ticket sources are set up (no secrets): the FD Archive and Freshdesk. Any staff user. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (((session.user as { role?: string }).role ?? '').toLowerCase() === 'customer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, (r.value ?? '').trim()]))
  return NextResponse.json({
    archive: !!(map['fd_archive_url'] && map['fd_archive_api_key']),
    freshdesk: !!(map['freshdesk_domain'] && map['freshdesk_api_key']),
  })
}
