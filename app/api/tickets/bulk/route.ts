import { and, eq, inArray, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canDeleteTickets, isAdmin } from '@/lib/auth-utils'
import { db, tickets } from '@/lib/db'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { coerceTicketType, DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { compactCompanySupportPriorities } from '@/lib/ticket-company-priority-order'
import { purgeTickets } from '@/lib/ticket-purge'

const MAX_IDS = 500

/**
 * POST /api/tickets/bulk { action, ids }
 * - move_to_trash: spam (or any non-trash) tickets go to Trash. Admin and manager.
 * - delete_permanently: removes tickets that are already in Trash for good. Admin only, cannot be undone.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role

  const body = (await request.json().catch(() => ({}))) as { action?: string; ids?: unknown }
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))]
  if (ids.length === 0) return NextResponse.json({ error: 'Pick at least one ticket' }, { status: 400 })
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `At most ${MAX_IDS} tickets at once` }, { status: 400 })

  if (body.action === 'delete_permanently') {
    if (!isAdmin(role)) return NextResponse.json({ error: 'Only an admin can delete tickets permanently' }, { status: 403 })
    try {
      const result = await purgeTickets(ids)
      console.info(`[tickets/bulk] ${session.user.email ?? session.user.id} permanently deleted ${result.deleted} ticket(s): ${ids.join(',')}`)
      return NextResponse.json({ ok: true, ...result })
    } catch (e) {
      console.error('[tickets/bulk] purge failed:', e)
      return NextResponse.json({ error: 'Could not delete the tickets' }, { status: 500 })
    }
  }

  if (body.action === 'move_to_trash') {
    if (!canDeleteTickets(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const rows = await db
      .select({ id: tickets.id, ticketType: tickets.ticketType, companyId: tickets.companyId })
      .from(tickets)
      .where(and(inArray(tickets.id, ids), ne(tickets.ticketType, 'trash')))
    if (rows.length === 0) return NextResponse.json({ ok: true, moved: 0, skipped: ids.length })

    const now = new Date()
    // Out of the support queue as well, like moving a single ticket to Trash.
    await db
      .update(tickets)
      .set({ ticketType: 'trash', priority: null, updatedAt: now })
      .where(inArray(tickets.id, rows.map((r) => r.id)))

    const companies = new Set(
      rows.filter((r) => coerceTicketType(r.ticketType) === DEFAULT_TICKET_TYPE && r.companyId).map((r) => r.companyId as string)
    )
    for (const companyId of companies) await compactCompanySupportPriorities(db, companyId)

    const actorRole = (role ?? '').toLowerCase() === 'customer' ? 'customer' : 'agent'
    for (const r of rows) {
      await logTicketActivity({
        ticketId: r.id,
        actorUserId: session.user.id,
        actorRole,
        action: 'ticket_updated',
        metadata: {
          changed_keys: ['ticket_type'],
          changes: { ticket_type: { from: coerceTicketType(r.ticketType), to: 'trash' }, via: 'bulk_move_to_trash' },
        },
      })
    }
    return NextResponse.json({ ok: true, moved: rows.length, skipped: ids.length - rows.length })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
