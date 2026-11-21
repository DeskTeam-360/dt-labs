import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { FD_IMPORT_MAX_IDS, parseFdTicketIds, runFdImport } from '@/lib/fd-import-run'

/**
 * POST /api/freshdesk/import-tickets { ticket_ids, source?: 'freshdesk' | 'archive' } — import specific tickets by their Freshdesk ID,
 * from Freshdesk (default) or from the FD Archive. Any staff user (not customers).
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (((session.user as { role?: string }).role ?? '').toLowerCase() === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const ids = parseFdTicketIds(body.ticket_ids)

  if (ids.length === 0) return NextResponse.json({ error: 'Enter at least one ticket ID' }, { status: 400 })
  if (ids.length > FD_IMPORT_MAX_IDS) {
    return NextResponse.json({ error: `Import at most ${FD_IMPORT_MAX_IDS} ticket IDs at a time` }, { status: 400 })
  }

  const run = await runFdImport(ids, body.source === 'archive' ? 'archive' : 'freshdesk', session.user.id)
  if ('error' in run) return NextResponse.json({ error: run.error }, { status: 400 })
  return NextResponse.json({ ok: true, ...run })
}
