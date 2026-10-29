import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm'

import { siteUrl, sqlList, ticketVisibility, toWibIso, wibDay, wibRange } from '@/lib/api-v1'
import { companies, db, ticketAssignees, tickets, users } from '@/lib/db'
import { CLOSED_LIKE_STATUS_LIST, isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

export type DueTicket = {
  id: number
  title: string
  status: string
  done: boolean
  priority: number | null
  due_date: string | null
  /** The WIB calendar day it is due */
  due_day: string
  overdue: boolean
  company: string | null
  assignees: { name: string; email: string }[]
  url: string
}

const MAX = 500

/**
 * Tickets that fall due in [from, to] (YYYY-MM-DD, WIB days), only those the caller may see.
 * `email` limits to tickets assigned to that person; `unfinishedOnly` leaves out finished tickets.
 */
export async function loadDueTickets(
  me: { id: string; role: string },
  from: string,
  to: string,
  opts: { email?: string; unfinishedOnly?: boolean } = {}
): Promise<DueTicket[]> {
  const { start, end } = wibRange(from, to)
  const conditions: SQL[] = [
    eq(tickets.ticketType, 'support'),
    sql`${tickets.dueDate} >= ${start.toISOString()}`,
    sql`${tickets.dueDate} <= ${end.toISOString()}`,
  ]
  const visible = await ticketVisibility(me)
  if (visible) conditions.push(visible)
  if (opts.unfinishedOnly) conditions.push(sql`${tickets.status} NOT IN (${sqlList(CLOSED_LIKE_STATUS_LIST)})`)
  if (opts.email) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.ticket_id = ${tickets.id} AND lower(u.email) = ${opts.email.toLowerCase()})`
    )
  }

  const rows = await db
    .select({ id: tickets.id, title: tickets.title, status: tickets.status, priority: tickets.priority, dueDate: tickets.dueDate, companyName: companies.name })
    .from(tickets)
    .leftJoin(companies, eq(tickets.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(asc(tickets.dueDate))
    .limit(MAX)
  if (rows.length === 0) return []

  const assigneeRows = await db
    .select({ ticketId: ticketAssignees.ticketId, name: users.fullName, email: users.email })
    .from(ticketAssignees)
    .innerJoin(users, eq(ticketAssignees.userId, users.id))
    .where(inArray(ticketAssignees.ticketId, rows.map((r) => r.id)))
  const assigneesBy = new Map<number, { name: string; email: string }[]>()
  for (const a of assigneeRows) assigneesBy.set(a.ticketId, [...(assigneesBy.get(a.ticketId) ?? []), { name: a.name ?? a.email, email: a.email }])

  const now = Date.now()
  return rows.map((r) => {
    const done = isClosedLikeTicketStatus(r.status)
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      done,
      priority: r.priority,
      due_date: toWibIso(r.dueDate),
      due_day: wibDay(r.dueDate!),
      overdue: !done && new Date(r.dueDate!).getTime() < now,
      company: r.companyName ?? null,
      assignees: assigneesBy.get(r.id) ?? [],
      url: `${siteUrl()}/tickets/${r.id}`,
    }
  })
}
