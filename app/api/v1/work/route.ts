import { and, eq, gte, inArray, lte, notInArray, type SQL, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { csv, hours, pageInfo, resolveWindow, siteUrl, sqlList, toWibIso, wibDay } from '@/lib/api-v1'
import { loadCalendarEntries } from '@/lib/calendar-query'
import { companies, db, shifts, tickets, ticketTimeTracker, users } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { getCapacityHoursByUser } from '@/lib/user-capacity'
import { INACTIVE_USER_STATUSES } from '@/lib/user-status'

export const dynamic = 'force-dynamic'

const MAX_DAYS = 92
const AGENT_ROLES = ['admin', 'operations', 'manager', 'staff']
const DEFAULT_TICKETS = 10
const MAX_TICKETS = 100

/**
 * GET /api/v1/work - what every active agent worked on in a time range, in one call.
 * Range: from/to (WIB days, default today), or hours=24, or since=<ISO datetime>[&until=<ISO datetime>]; at most 92 days.
 * email (comma), role (comma), min_hours (leave out people with less), tickets=0 (summaries only),
 * limit_tickets (most tickets per person, default 10, max 100), limit and offset to page through the agents (default all, max 200).
 * Agents who tracked nothing are included with zero hours, so you can see who did not work. Sorted by hours, most first.
 * Auth: browser session or an API key with the `users:read` scope.
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'users:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const win = resolveWindow(q, MAX_DAYS)
  if ('error' in win) return NextResponse.json({ error: win.error }, { status: 400 })
  const { start, end } = win
  const from = wibDay(start)
  const to = wibDay(end)

  const emails = csv(q.get('email')).map((e) => e.toLowerCase())
  const roles = csv(q.get('role')).map((r) => r.toLowerCase()).filter((r) => AGENT_ROLES.includes(r))
  const minHours = Number(q.get('min_hours')) || 0
  const withTickets = q.get('tickets') !== '0'
  const perAgent = Math.min(MAX_TICKETS, Math.max(1, Number(q.get('limit_tickets')) || DEFAULT_TICKETS))
  const limit = Math.min(200, Math.max(1, Number(q.get('limit')) || 200))
  const offset = Math.max(0, Number(q.get('offset')) || 0)

  const conditions: SQL[] = [inArray(users.role, roles.length ? roles : AGENT_ROLES), notInArray(users.status, INACTIVE_USER_STATUSES)]
  if (emails.length) conditions.push(sql`lower(${users.email}) IN (${sqlList(emails)})`)

  const agents = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role, shiftTitle: shifts.title, shiftStart: shifts.startTime, shiftEnd: shifts.endTime })
    .from(users)
    .leftJoin(shifts, eq(users.shiftId, shifts.id))
    .where(and(...conditions))
  const ids = agents.map((a) => a.id)

  const [sessions, capacity, calendar] = ids.length
    ? await Promise.all([
        db
          .select({
            userId: ticketTimeTracker.userId,
            ticketId: ticketTimeTracker.ticketId,
            startTime: ticketTimeTracker.startTime,
            stopTime: ticketTimeTracker.stopTime,
            durationSeconds: ticketTimeTracker.durationSeconds,
            durationAdjustment: ticketTimeTracker.durationAdjustment,
            title: tickets.title,
            status: tickets.status,
            companyName: companies.name,
          })
          .from(ticketTimeTracker)
          .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
          .leftJoin(companies, eq(tickets.companyId, companies.id))
          .where(and(inArray(ticketTimeTracker.userId, ids), gte(ticketTimeTracker.startTime, start), lte(ticketTimeTracker.startTime, end))),
        getCapacityHoursByUser(ids, from, to),
        loadCalendarEntries(from, to),
      ])
    : [[], new Map<string, number>(), { events: [], holidays: [] }]

  const now = Date.now()
  type Agg = { seconds: number; sessions: number; first: Date | null; last: Date | null; running: { ticket_id: number; since: string | null } | null; tickets: Map<number, { title: string; status: string; company: string | null; seconds: number; sessions: number }>; days: Set<string> }
  const agg = new Map<string, Agg>()
  for (const s of sessions) {
    const a = agg.get(s.userId) ?? { seconds: 0, sessions: 0, first: null, last: null, running: null, tickets: new Map(), days: new Set<string>() }
    const startAt = new Date(s.startTime)
    const stopAt = s.stopTime ? new Date(s.stopTime) : null
    const sec = stopAt ? reportedDurationSeconds({ durationSeconds: s.durationSeconds, durationAdjustment: s.durationAdjustment }) : Math.max(0, Math.floor((now - startAt.getTime()) / 1000))
    a.seconds += sec
    a.sessions++
    a.days.add(wibDay(startAt))
    a.first = !a.first || startAt < a.first ? startAt : a.first
    const endAt = stopAt ?? new Date(now)
    a.last = !a.last || endAt > a.last ? endAt : a.last
    if (!stopAt) a.running = { ticket_id: s.ticketId, since: toWibIso(startAt) }
    const t = a.tickets.get(s.ticketId) ?? { title: s.title, status: s.status, company: s.companyName ?? null, seconds: 0, sessions: 0 }
    t.seconds += sec
    t.sessions++
    a.tickets.set(s.ticketId, t)
    agg.set(s.userId, a)
  }

  const leaveDays = new Map<string, number>()
  for (const e of calendar.events) {
    if (e.type === 'leave' && e.user_id) {
      const overlapStart = e.start_date < from ? from : e.start_date
      const overlapEnd = e.end_date > to ? to : e.end_date
      leaveDays.set(e.user_id, (leaveDays.get(e.user_id) ?? 0) + Math.max(0, Math.round((Date.parse(`${overlapEnd}T00:00:00Z`) - Date.parse(`${overlapStart}T00:00:00Z`)) / 86400000) + 1))
    }
  }

  let out = agents
    .map((a) => {
      const g = agg.get(a.id)
      const seconds = g?.seconds ?? 0
      const cap = capacity.get(a.id) ?? 0
      const list = g ? [...g.tickets.entries()].sort(([, x], [, y]) => y.seconds - x.seconds) : []
      return {
        id: a.id,
        full_name: a.fullName || a.email,
        email: a.email,
        role: a.role,
        shift: a.shiftTitle ? { title: a.shiftTitle, start: String(a.shiftStart).slice(0, 5), end: String(a.shiftEnd).slice(0, 5), timezone: 'WIB' } : null,
        tracked_seconds: seconds,
        tracked_hours: hours(seconds),
        capacity_hours: cap,
        utilization_pct: cap > 0 ? Math.round((seconds / 3600 / cap) * 100) : null,
        sessions: g?.sessions ?? 0,
        tickets_worked: list.length,
        days_with_work: g?.days.size ?? 0,
        leave_days: leaveDays.get(a.id) ?? 0,
        first_start: toWibIso(g?.first),
        last_stop: toWibIso(g?.last),
        running_now: g?.running ?? null,
        ...(withTickets
          ? {
              tickets: list.slice(0, perAgent).map(([id, t]) => ({
                id,
                title: t.title,
                status: t.status,
                company: t.company,
                tracked_hours: hours(t.seconds),
                sessions: t.sessions,
                url: `${siteUrl()}/tickets/${id}`,
              })),
              tickets_has_more: list.length > perAgent,
            }
          : {}),
      }
    })
    .filter((a) => a.tracked_hours >= minHours)
    .sort((x, y) => y.tracked_seconds - x.tracked_seconds || x.full_name.localeCompare(y.full_name))

  const total = out.length
  const totalSeconds = out.reduce((n, a) => n + a.tracked_seconds, 0)
  out = out.slice(offset, offset + limit)

  return NextResponse.json({
    window: win.label,
    from,
    to,
    totals: {
      agents: total,
      agents_with_work: agg.size,
      tracked_hours: hours(totalSeconds),
      capacity_hours: Math.round([...capacity.values()].reduce((n, h) => n + h, 0) * 100) / 100,
    },
    limit,
    offset,
    ...pageInfo(offset, out.length, total),
    agents: out,
  })
}
