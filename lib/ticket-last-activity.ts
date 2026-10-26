import { and, inArray, isNull, ne, or, sql } from 'drizzle-orm'

import { db, ticketActivityLog, ticketComments, ticketTimeTracker } from '@/lib/db'

/**
 * When a person last did something on each ticket: a comment or reply, any change in the activity log, or time
 * tracked (a running timer counts as now). Automation is left out, and so is renumbering of the priority queue,
 * so the date is not moved by tickets nobody touched. Falls back to the creation date.
 */
export async function getLastActivity(tickets: { id: number; createdAt: Date | string | null }[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (tickets.length === 0) return out
  const ids = tickets.map((t) => t.id)

  const [comments, activity, tracked] = await Promise.all([
    db
      .select({ id: ticketComments.ticketId, at: sql<string>`max(${ticketComments.createdAt})` })
      .from(ticketComments)
      .where(and(inArray(ticketComments.ticketId, ids), or(isNull(ticketComments.authorType), ne(ticketComments.authorType, 'automation'))))
      .groupBy(ticketComments.ticketId),
    db
      .select({ id: ticketActivityLog.ticketId, at: sql<string>`max(${ticketActivityLog.createdAt})` })
      .from(ticketActivityLog)
      .where(and(inArray(ticketActivityLog.ticketId, ids), ne(ticketActivityLog.actorRole, 'automation')))
      .groupBy(ticketActivityLog.ticketId),
    db
      .select({ id: ticketTimeTracker.ticketId, at: sql<string>`max(coalesce(${ticketTimeTracker.stopTime}, now()))` })
      .from(ticketTimeTracker)
      .where(inArray(ticketTimeTracker.ticketId, ids))
      .groupBy(ticketTimeTracker.ticketId),
  ])

  const bump = (id: number | null, at: unknown) => {
    if (id == null || !at) return
    const d = at instanceof Date ? at : new Date(String(at))
    if (Number.isNaN(d.getTime())) return
    const iso = d.toISOString()
    const cur = out.get(id)
    if (!cur || iso > cur) out.set(id, iso)
  }
  for (const t of tickets) bump(t.id, t.createdAt)
  for (const r of comments) bump(r.id, r.at)
  for (const r of activity) bump(r.id, r.at)
  for (const r of tracked) bump(r.id, r.at)
  return out
}
