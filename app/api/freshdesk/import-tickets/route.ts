import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import {
  createFdClient,
  type FdTicketImportResult,
  importFdTicketById,
  loadFdAgentNames,
  resetTicketIdSequence,
} from '@/lib/freshdesk-ticket-import'

const MAX_IDS = 50

/** POST /api/freshdesk/import-tickets — import specific Freshdesk tickets by ID. Any staff user (not customers). */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (((session.user as { role?: string }).role ?? '').toLowerCase() === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const raw: unknown[] = Array.isArray(body.ticket_ids) ? body.ticket_ids : String(body.ticket_ids ?? '').split(/[\s,;]+/)
  const ids = [...new Set(raw.map((v) => Number(String(v).replace(/^#/, '').trim())))].filter(
    (n) => Number.isInteger(n) && n > 0
  )

  if (ids.length === 0) return NextResponse.json({ error: 'Enter at least one ticket ID' }, { status: 400 })
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Import at most ${MAX_IDS} ticket IDs at a time` }, { status: 400 })
  }

  const fd = await createFdClient()
  if (!fd) return NextResponse.json({ error: 'Freshdesk domain and API key are not configured' }, { status: 400 })

  const agentNames = await loadFdAgentNames(fd)
  const results: FdTicketImportResult[] = []
  for (const ticketId of ids) {
    try {
      results.push(await importFdTicketById({ fd, ticketId, adminUserId: session.user.id, agentNames }))
    } catch (e) {
      console.error('[FD import-tickets] ticket', ticketId, e)
      results.push({ ticketId, status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  if (results.some((r) => r.status === 'imported')) {
    try {
      await resetTicketIdSequence()
    } catch (e) {
      console.error('[FD import-tickets] sequence reset failed', e)
    }
  }

  return NextResponse.json({ ok: true, results })
}
