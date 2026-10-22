import { and, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { db, ticketAssignees, tickets, ticketSkills, userSkills } from '@/lib/db'
import { ACTIVE_WORKLOAD_STATUSES } from '@/lib/skills'

/**
 * GET /api/board/skill-match?ticket_ids=1,2&user_ids=a,b   (admin only)
 * -> { tickets: { [ticketId]: { has_skills, users: { [userId]: matchPct } } }, load: { [userId]: activeTickets } }
 * matchPct = share of the ticket's skills the person has. Tickets without skills have has_skills = false.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const ticketIds = (url.searchParams.get('ticket_ids') ?? '').split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n))
  const userIds = (url.searchParams.get('user_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (ticketIds.length === 0 || userIds.length === 0) return NextResponse.json({ tickets: {}, load: {} })

  const [tRows, uRows, loadRows] = await Promise.all([
    db.select({ ticketId: ticketSkills.ticketId, skillId: ticketSkills.skillId }).from(ticketSkills).where(inArray(ticketSkills.ticketId, ticketIds)),
    db.select({ userId: userSkills.userId, skillId: userSkills.skillId }).from(userSkills).where(inArray(userSkills.userId, userIds)),
    db
      .select({ userId: ticketAssignees.userId, n: sql<number>`count(*)::int` })
      .from(ticketAssignees)
      .innerJoin(tickets, eq(ticketAssignees.ticketId, tickets.id))
      .where(and(inArray(ticketAssignees.userId, userIds), inArray(tickets.status, ACTIVE_WORKLOAD_STATUSES), eq(tickets.ticketType, 'support')))
      .groupBy(ticketAssignees.userId),
  ])

  const needs = new Map<number, string[]>()
  for (const r of tRows) (needs.get(r.ticketId) ?? needs.set(r.ticketId, []).get(r.ticketId)!).push(r.skillId)
  const has = new Map<string, Set<string>>()
  for (const r of uRows) (has.get(r.userId) ?? has.set(r.userId, new Set()).get(r.userId)!).add(r.skillId)

  const out: Record<number, { has_skills: boolean; users: Record<string, number> }> = {}
  for (const id of ticketIds) {
    const req = needs.get(id) ?? []
    const users: Record<string, number> = {}
    if (req.length > 0) {
      for (const u of userIds) {
        const mine = has.get(u)
        users[u] = Math.round((req.filter((s) => mine?.has(s)).length / req.length) * 100)
      }
    }
    out[id] = { has_skills: req.length > 0, users }
  }
  return NextResponse.json({ tickets: out, load: Object.fromEntries(loadRows.map((l) => [l.userId, Number(l.n)])) })
}
