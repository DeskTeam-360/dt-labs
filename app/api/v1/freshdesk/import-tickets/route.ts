import { NextResponse } from 'next/server'

import { apiUnauthorized, getApiUser, isTeamRole } from '@/lib/api-auth'
import { FD_IMPORT_MAX_IDS, parseFdTicketIds, runFdImport } from '@/lib/fd-import-run'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/freshdesk/import-tickets { ticket_ids, source?: 'freshdesk' | 'archive' } - copies tickets (with their conversation and
 * attachments) from Freshdesk, or from the FD Archive, into DeskTeam360 under their Freshdesk number. Tickets already here are skipped.
 * Auth: browser session or an API key with the `tickets:import` scope.
 */
export async function POST(request: Request) {
  const me = await getApiUser(request, 'tickets:import')
  if (!me) return apiUnauthorized(request)
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const ids = parseFdTicketIds(body.ticket_ids)
  if (ids.length === 0) return NextResponse.json({ error: 'Send at least one ticket number in ticket_ids' }, { status: 400 })
  if (ids.length > FD_IMPORT_MAX_IDS) return NextResponse.json({ error: `Import at most ${FD_IMPORT_MAX_IDS} tickets per call` }, { status: 400 })
  if (body.source !== undefined && body.source !== 'freshdesk' && body.source !== 'archive') {
    return NextResponse.json({ error: 'source must be "freshdesk" or "archive"' }, { status: 400 })
  }

  const run = await runFdImport(ids, body.source === 'archive' ? 'archive' : 'freshdesk', me.id)
  if ('error' in run) return NextResponse.json({ error: run.error }, { status: 400 })
  return NextResponse.json({ ok: true, ...run })
}
