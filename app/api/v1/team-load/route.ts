import { and, eq, inArray, notInArray, type SQL, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { csv, siteUrl, sqlList, ticketVisibility, toWibIso, wibDay } from '@/lib/api-v1'
import { eachDay, loadCalendarEntries } from '@/lib/calendar-query'
import { companies, db, shifts, ticketAssignees, tickets, users } from '@/lib/db'
import { ACTIVE_WORKLOAD_STATUSES } from '@/lib/skills'
import { LOAD_CRITICAL_AT, LOAD_WARNING_AT, loadLevel } from '@/lib/team-load-levels'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'
import { INACTIVE_USER_STATUSES } from '@/lib/user-status'

export const dynamic = 'force-dynamic'

const AGENT_ROLES = ['admin', 'operations', 'manager', 'staff']
const DEFAULT_PER_AGENT = 50
const MAX_PER_AGENT = 200

/**
 * GET /api/v1/team-load - every active agent with the tickets assigned to them that still need work
 * (default statuses: open, received, working_team). Agents with nothing assigned are listed too.
 * status (slugs, comma), email, role, tickets=0 (counts only), limit_per_agent, include=unassigned.
 * Auth: browser session or an API key with the `team-load:read` scope.
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'team-load:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const statuses = csv(q.get('status'))
  const statusList = statuses.length ? statuses : ACTIVE_WORKLOAD_STATUSES
  const emails = csv(q.get('email')).map((e) => e.toLowerCase())
  const roles = csv(q.get('role')).map((r) => r.toLowerCase())
  const withTickets = q.get('tickets') !== '0'
  const perAgent = Math.min(MAX_PER_AGENT, Math.max(1, Number(q.get('limit_per_agent')) || DEFAULT_PER_AGENT))
  const includeUnassigned = csv(q.get('include')).includes('unassigned')

  const agentConditions: SQL[] = [inArray(users.role, roles.length ? roles.filter((r) => AGENT_ROLES.includes(r)) : AGENT_ROLES), notInArray(users.status, INACTIVE_USER_STATUSES)]
  if (emails.length) agentConditions.push(sql`lower(${users.email}) IN (${sqlList(emails)})`)

  const today = wibDay(new Date())
  const visible = await ticketVisibility(me)
  const ticketConditions: SQL[] = [eq(tickets.ticketType, 'support'), inArray(tickets.status, statusList)]
  if (visible) ticketConditions.push(visible)

  const [agents, calendar] = await Promise.all([
    db
      .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role, shiftTitle: shifts.title, shiftStart: shifts.startTime, shiftEnd: shifts.endTime })
      .from(users)
      .leftJoin(shifts, eq(users.shiftId, shifts.id))
      .where(and(...agentConditions)),
    loadCalendarEntries(today, today),
  ])
  const agentIds = agents.map((a) => a.id)
  const onLeave = new Set(calendar.events.filter((e) => e.type === 'leave' && e.user_id && eachDay(e.start_date, e.end_date).includes(today)).map((e) => e.user_id as string))

  const rows = agentIds.length
    ? await db
        .select({
          userId: ticketAssignees.userId,
          id: tickets.id,
          title: tickets.title,
          status: tickets.status,
          priority: tickets.priority,
          dueDate: tickets.dueDate,
          companyName: companies.name,
        })
        .from(ticketAssignees)
        .innerJoin(tickets, eq(ticketAssignees.ticketId, tickets.id))
        .leftJoin(companies, eq(tickets.companyId, companies.id))
        .where(and(inArray(ticketAssignees.userId, agentIds), ...ticketConditions))
    : []

  const now = Date.now()
  const todayStart = new Date(`${today}T00:00:00+07:00`).getTime()
  const todayEnd = new Date(`${today}T23:59:59.999+07:00`).getTime()
  const brief = (r: (typeof rows)[number]) => {
    const due = r.dueDate ? new Date(r.dueDate).getTime() : null
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      due_date: toWibIso(r.dueDate),
      overdue: due !== null && due < now && !isClosedLikeTicketStatus(r.status),
      company: r.companyName ?? null,
      url: `${siteUrl()}/tickets/${r.id}`,
      _due: due,
    }
  }

  const byAgent = new Map<string, ReturnType<typeof brief>[]>()
  for (const r of rows) byAgent.set(r.userId, [...(byAgent.get(r.userId) ?? []), brief(r)])

  // Most urgent first: overdue and earliest due date, then priority number, then ticket number.
  const sortTickets = (list: ReturnType<typeof brief>[]) =>
    [...list].sort((a, b) => (a._due ?? Infinity) - (b._due ?? Infinity) || (a.priority ?? 1e9) - (b.priority ?? 1e9) || a.id - b.id)
  const strip = ({ _due, ...rest }: ReturnType<typeof brief>) => {
    void _due
    return rest
  }

  const agentsOut = agents
    .map((a) => {
      const list = byAgent.get(a.id) ?? []
      const byStatus: Record<string, number> = Object.fromEntries(statusList.map((s) => [s, 0]))
      for (const t of list) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
      const sorted = sortTickets(list)
      return {
        id: a.id,
        name: a.fullName || a.email,
        email: a.email,
        role: a.role,
        shift: a.shiftTitle ? { title: a.shiftTitle, start: String(a.shiftStart).slice(0, 5), end: String(a.shiftEnd).slice(0, 5), timezone: 'WIB' } : null,
        on_leave_today: onLeave.has(a.id),
        open_tickets: list.length,
        load_level: loadLevel(list.length),
        by_status: byStatus,
        overdue: list.filter((t) => t.overdue).length,
        due_today: list.filter((t) => t._due !== null && t._due >= todayStart && t._due <= todayEnd).length,
        ...(withTickets ? { tickets: sorted.slice(0, perAgent).map(strip), tickets_shown: Math.min(sorted.length, perAgent) } : {}),
      }
    })
    .sort((x, y) => y.open_tickets - x.open_tickets || x.name.localeCompare(y.name))

  // Tickets in these statuses that nobody is assigned to.
  const unassignedWhere = and(...ticketConditions, sql`NOT EXISTS (SELECT 1 FROM ticket_assignees ta WHERE ta.ticket_id = ${tickets.id})`)
  const [unassignedCount] = await db.select({ n: sql<number>`count(*)::int` }).from(tickets).where(unassignedWhere)
  const unassignedRows = includeUnassigned
    ? await db
        .select({ id: tickets.id, title: tickets.title, status: tickets.status, priority: tickets.priority, dueDate: tickets.dueDate, companyName: companies.name })
        .from(tickets)
        .leftJoin(companies, eq(tickets.companyId, companies.id))
        .where(unassignedWhere)
        .orderBy(sql`${tickets.dueDate} ASC NULLS LAST`, tickets.id)
        .limit(MAX_PER_AGENT)
    : []

  const distinct = new Set(rows.map((r) => r.id))
  return NextResponse.json({
    generated_at: toWibIso(new Date()),
    statuses: statusList,
    thresholds: { warning_from: LOAD_WARNING_AT, critical_from: LOAD_CRITICAL_AT },
    totals: {
      agents: agentsOut.length,
      tickets_assigned: distinct.size,
      unassigned: unassignedCount?.n ?? 0,
      overdue: agentsOut.reduce((n, a) => n + a.overdue, 0),
    },
    agents: agentsOut,
    unassigned: includeUnassigned
      ? unassignedRows.map((r) => strip({ ...brief({ userId: '', ...r }) }))
      : undefined,
  })
}
