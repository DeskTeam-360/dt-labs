import { and, desc, eq, inArray, notInArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, db, ticketAssignees, tickets, users } from '@/lib/db'
import { INACTIVE_USER_STATUSES } from '@/lib/user-status'

export const dynamic = 'force-dynamic'

/** Statuses that mean the work is over: such a ticket no longer needs a live assignee. */
const DONE_STATUSES = ['completed', 'resolved', 'closed']

/**
 * GET /api/tickets/inactive-assignees - open tickets that are assigned to someone who is no longer active (admin, operations).
 * One entry per ticket, with the inactive people on it and the people still active on it.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'operations'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const offRows = await db
    .select({ ticketId: ticketAssignees.ticketId, userId: users.id, name: users.fullName, email: users.email, status: users.status })
    .from(ticketAssignees)
    .innerJoin(users, eq(users.id, ticketAssignees.userId))
    .innerJoin(tickets, eq(tickets.id, ticketAssignees.ticketId))
    .where(and(inArray(users.status, INACTIVE_USER_STATUSES), notInArray(tickets.status, DONE_STATUSES)))
  if (offRows.length === 0) return NextResponse.json({ count: 0, tickets: [] })

  const ticketIds = [...new Set(offRows.map((r) => r.ticketId))]
  const [ticketRows, allAssignees] = await Promise.all([
    db
      .select({ id: tickets.id, title: tickets.title, status: tickets.status, companyName: companies.name, createdAt: tickets.createdAt })
      .from(tickets)
      .leftJoin(companies, eq(companies.id, tickets.companyId))
      .where(inArray(tickets.id, ticketIds))
      .orderBy(desc(tickets.createdAt)),
    db
      .select({ ticketId: ticketAssignees.ticketId, userId: users.id, name: users.fullName, email: users.email, status: users.status })
      .from(ticketAssignees)
      .innerJoin(users, eq(users.id, ticketAssignees.userId))
      .where(inArray(ticketAssignees.ticketId, ticketIds)),
  ])

  const isOff = (s: string | null) => INACTIVE_USER_STATUSES.includes((s ?? '').toLowerCase())
  const data = ticketRows.map((t) => {
    const mine = allAssignees.filter((a) => a.ticketId === t.id)
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      company: t.companyName,
      created_at: t.createdAt ? new Date(t.createdAt).toISOString() : null,
      inactive: mine.filter((a) => isOff(a.status)).map((a) => ({ id: a.userId, name: a.name || a.email, status: a.status })),
      active: mine.filter((a) => !isOff(a.status)).map((a) => ({ id: a.userId, name: a.name || a.email })),
    }
  })
  return NextResponse.json({ count: data.length, tickets: data })
}
