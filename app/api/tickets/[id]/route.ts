import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canDeleteTickets } from '@/lib/auth-utils'
import { db, tickets } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { coerceTicketType, DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { compactCompanySupportPriorities } from '@/lib/ticket-company-priority-order'
import { patchTicket, triggerTicketUpdatedAutomation } from '@/lib/ticket-patch'

/** PATCH /api/tickets/[id] - Update ticket (status, or full) */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return patchTicket(request, ctx, await auth())
}

/**
 * DELETE /api/tickets/[id] — does not remove the ticket; moves it to trash (same as ticket_type trash).
 * Data is retained for recovery from the Trash folder.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const delRoleRaw = (session.user as { role?: string }).role
  if (!canDeleteTickets(delRoleRaw)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const delRole = delRoleRaw?.toLowerCase()
  const delActorRole: TicketActorRole = delRole === 'customer' ? 'customer' : 'agent'
  const actorUserId = session.user.id!

  const [cur] = await db
    .select({ ticketType: tickets.ticketType, companyId: tickets.companyId })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)
  if (!cur) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const beforeType = coerceTicketType(cur.ticketType)
  if (beforeType === 'trash') {
    await triggerTicketUpdatedAutomation(ticketId)
    bumpTicketDataVersion(ticketId)
    return NextResponse.json({ ok: true, ticket_type: 'trash' })
  }

  await db
    .update(tickets)
    .set({ ticketType: 'trash', updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))

  if (cur.companyId && beforeType === DEFAULT_TICKET_TYPE) {
    await compactCompanySupportPriorities(db, cur.companyId)
  }

  await logTicketActivity({
    ticketId,
    actorUserId,
    actorRole: delActorRole,
    action: 'ticket_updated',
    metadata: {
      changed_keys: ['ticket_type'],
      changes: { ticket_type: { from: beforeType, to: 'trash' }, via: 'delete_as_trash' },
    },
  })

  await triggerTicketUpdatedAutomation(ticketId)
  bumpTicketDataVersion(ticketId)

  return NextResponse.json({ ok: true, ticket_type: 'trash' })
}
