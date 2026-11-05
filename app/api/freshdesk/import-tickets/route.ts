import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { archiveSource, freshdeskSource, loadArchiveSettings, type TicketSource } from '@/lib/fd-ticket-source'
import {
  createFdClient,
  type FdTicketImportResult,
  importFdTicketById,
  loadFdAgentNames,
  resetTicketIdSequence,
} from '@/lib/freshdesk-ticket-import'

const MAX_IDS = 50

/** The place tickets are read from: Freshdesk itself, or the FD Archive. Null (with a message) when that one is not set up in Settings. */
async function buildSource(kind: 'freshdesk' | 'archive'): Promise<{ source: TicketSource } | { error: string }> {
  if (kind === 'archive') {
    const archive = await loadArchiveSettings()
    if (!archive) return { error: 'The FD Archive address and API key are not set. Fill them in under Settings, Freshdesk Import.' }
    return { source: await archiveSource(archive.baseUrl, archive.apiKey) }
  }
  const fd = await createFdClient()
  if (!fd) return { error: 'Freshdesk domain and API key are not configured' }
  return { source: freshdeskSource(fd, await loadFdAgentNames(fd)) }
}

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
  const raw: unknown[] = Array.isArray(body.ticket_ids) ? body.ticket_ids : String(body.ticket_ids ?? '').split(/[\s,;]+/)
  const ids = [...new Set(raw.map((v) => Number(String(v).replace(/^#/, '').trim())))].filter(
    (n) => Number.isInteger(n) && n > 0
  )

  if (ids.length === 0) return NextResponse.json({ error: 'Enter at least one ticket ID' }, { status: 400 })
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Import at most ${MAX_IDS} ticket IDs at a time` }, { status: 400 })
  }

  const built = await buildSource(body.source === 'archive' ? 'archive' : 'freshdesk')
  if ('error' in built) return NextResponse.json({ error: built.error }, { status: 400 })

  const results: FdTicketImportResult[] = []
  for (const ticketId of ids) {
    try {
      results.push(await importFdTicketById({ source: built.source, ticketId, adminUserId: session.user.id }))
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

  return NextResponse.json({ ok: true, source: built.source.kind, results })
}
