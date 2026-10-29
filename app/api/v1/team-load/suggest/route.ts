import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { ticketVisibility } from '@/lib/api-v1'
import { suggestCandidates } from '@/lib/team-suggest'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/team-load/suggest?from_email=person@company.com - who could take over what this person holds.
 * For each unfinished ticket assigned to them (most urgent first) the best candidates, ranked on skill match, leave
 * (until the due date), shift and load, each with reasons and concerns. Or ticket_id=123 for one ticket (from_email then optional).
 * ticket_limit (default 20, max 50), candidates (per ticket, default 3, max 10). It only suggests; nothing is assigned.
 * Auth: browser session or an API key with the `team-load:read` scope.
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'team-load:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const ticketIdParam = (q.get('ticket_id') ?? '').replace(/^#/, '')
  const ticketId = ticketIdParam ? Number(ticketIdParam) : undefined
  if (ticketIdParam && (!Number.isInteger(ticketId) || (ticketId as number) <= 0)) return NextResponse.json({ error: 'ticket_id must be a ticket number' }, { status: 400 })

  const result = await suggestCandidates({
    fromEmail: (q.get('from_email') ?? '').trim() || undefined,
    ticketId,
    ticketLimit: Number(q.get('ticket_limit')) || undefined,
    candidatesPerTicket: Number(q.get('candidates')) || undefined,
    visible: await ticketVisibility(me),
  })
  if ('error' in result && typeof result.status === 'number') return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
