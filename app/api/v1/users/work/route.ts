import { and, asc, desc, eq, gte, lte, notInArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { hours, resolveWindow, siteUrl, toWibIso, wibDay } from '@/lib/api-v1'
import { loadCalendarEntries } from '@/lib/calendar-query'
import { companies, db, shifts, ticketAssignees, tickets, ticketTimeTracker, users } from '@/lib/db'
import { CLOSED_LIKE_STATUS_LIST } from '@/lib/ticket-status-workflow'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { getCapacityHoursByUser } from '@/lib/user-capacity'
import { isUserInactive } from '@/lib/user-status'

export const dynamic = 'force-dynamic'

const MAX_DAYS = 92

/**
 * GET /api/v1/users/work?email=person@company.com&from=YYYY-MM-DD&to=YYYY-MM-DD
 * What an active team member worked on in a time range, with the hours they tracked: per day (first start, last stop),
 * per company and per ticket, plus their shift, capacity, calendar entries (leave, duty) and what is on their plate now.
 * The range: from/to (WIB days, default today), or hours=24 (the last 24 hours), or since=<ISO datetime>[&until=<ISO datetime>];
 * at most 92 days. include=sessions adds every single time entry.
 * Auth: browser session or an API key with the `users:read` scope.
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'users:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const email = (q.get('email') ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })
  const win = resolveWindow(q, MAX_DAYS)
  if ('error' in win) return NextResponse.json({ error: win.error }, { status: 400 })
  const { start, end } = win
  const from = wibDay(start)
  const to = wibDay(end)
  const withSessions = (q.get('include') ?? '').split(',').includes('sessions')

  const [person] = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role, status: users.status, shiftId: users.shiftId })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)
  if (!person || !isTeamRole((person.role ?? '').toLowerCase()) || isUserInactive(person.status)) {
    return NextResponse.json({ error: 'No active team member with that email' }, { status: 404 })
  }

  const now = new Date()

  const [sessionRows, shiftRow, capacity, calendar, plate] = await Promise.all([
    db
      .select({
        id: ticketTimeTracker.id,
        ticketId: ticketTimeTracker.ticketId,
        jobType: ticketTimeTracker.jobType,
        startTime: ticketTimeTracker.startTime,
        stopTime: ticketTimeTracker.stopTime,
        durationSeconds: ticketTimeTracker.durationSeconds,
        durationAdjustment: ticketTimeTracker.durationAdjustment,
        note: ticketTimeTracker.note,
        title: tickets.title,
        status: tickets.status,
        companyId: tickets.companyId,
        companyName: companies.name,
      })
      .from(ticketTimeTracker)
      .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(
        and(
          eq(ticketTimeTracker.userId, person.id),
          gte(ticketTimeTracker.startTime, start),
          lte(ticketTimeTracker.startTime, end)
        )
      )
      .orderBy(asc(ticketTimeTracker.startTime)),
    person.shiftId ? db.select({ title: shifts.title, start: shifts.startTime, end: shifts.endTime }).from(shifts).where(eq(shifts.id, person.shiftId)).limit(1) : Promise.resolve([]),
    getCapacityHoursByUser([person.id], from, to),
    loadCalendarEntries(from, to),
    db
      .select({ id: tickets.id, title: tickets.title, status: tickets.status, dueDate: tickets.dueDate, companyName: companies.name })
      .from(ticketAssignees)
      .innerJoin(tickets, eq(ticketAssignees.ticketId, tickets.id))
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(and(eq(ticketAssignees.userId, person.id), eq(tickets.ticketType, 'support'), notInArray(tickets.status, CLOSED_LIKE_STATUS_LIST)))
      .orderBy(desc(tickets.updatedAt))
      .limit(50),
  ])

  type Agg = { seconds: number; sessions: number; first: Date | null; last: Date | null }
  const byDay = new Map<string, Agg & { tickets: Set<number> }>()
  const byTicket = new Map<number, Agg & { title: string; status: string; company: string | null; jobTypes: Set<string> }>()
  const byCompany = new Map<string, { name: string; seconds: number; tickets: Set<number> }>()
  let totalSeconds = 0
  let running: { ticket_id: number; title: string; since: string | null } | null = null
  const sessionsOut: Array<Record<string, unknown>> = []

  for (const s of sessionRows) {
    const startAt = new Date(s.startTime)
    const stopAt = s.stopTime ? new Date(s.stopTime) : null
    // A running timer counts up to now.
    const sec = stopAt
      ? reportedDurationSeconds({ durationSeconds: s.durationSeconds, durationAdjustment: s.durationAdjustment })
      : Math.max(0, Math.floor((now.getTime() - startAt.getTime()) / 1000))
    if (!stopAt) running = { ticket_id: s.ticketId, title: s.title, since: toWibIso(startAt) }
    totalSeconds += sec

    const day = byDay.get(wibDay(startAt)) ?? { seconds: 0, sessions: 0, first: null, last: null, tickets: new Set<number>() }
    day.seconds += sec
    day.sessions++
    day.first = !day.first || startAt < day.first ? startAt : day.first
    const endAt = stopAt ?? now
    day.last = !day.last || endAt > day.last ? endAt : day.last
    day.tickets.add(s.ticketId)
    byDay.set(wibDay(startAt), day)

    const t = byTicket.get(s.ticketId) ?? { seconds: 0, sessions: 0, first: null, last: null, title: s.title, status: s.status, company: s.companyName ?? null, jobTypes: new Set<string>() }
    t.seconds += sec
    t.sessions++
    t.first = !t.first || startAt < t.first ? startAt : t.first
    t.last = !t.last || endAt > t.last ? endAt : t.last
    if (s.jobType) t.jobTypes.add(s.jobType)
    byTicket.set(s.ticketId, t)

    const ck = s.companyId ?? 'none'
    const c = byCompany.get(ck) ?? { name: s.companyName ?? '(no company)', seconds: 0, tickets: new Set<number>() }
    c.seconds += sec
    c.tickets.add(s.ticketId)
    byCompany.set(ck, c)

    if (withSessions) {
      sessionsOut.push({
        id: s.id,
        ticket_id: s.ticketId,
        ticket_title: s.title,
        job_type: s.jobType,
        start: toWibIso(startAt),
        stop: toWibIso(stopAt),
        running: !stopAt,
        seconds: sec,
        hours: hours(sec),
        note: s.note,
      })
    }
  }

  const capacityHours = capacity.get(person.id) ?? 0
  const mine = calendar.events.filter((e) => e.user_id === person.id)

  return NextResponse.json({
    user: { id: person.id, full_name: person.fullName, email: person.email, role: person.role, status: person.status },
    from,
    to,
    window: win.label,
    shift: shiftRow[0] ? { title: shiftRow[0].title, start: String(shiftRow[0].start).slice(0, 5), end: String(shiftRow[0].end).slice(0, 5), timezone: 'WIB' } : null,
    summary: {
      tracked_seconds: totalSeconds,
      tracked_hours: hours(totalSeconds),
      capacity_hours: capacityHours,
      /** tracked hours as a share of capacity hours; null when there is no capacity in the range */
      utilization_pct: capacityHours > 0 ? Math.round((totalSeconds / 3600 / capacityHours) * 100) : null,
      tickets_worked: byTicket.size,
      sessions: sessionRows.length,
      days_with_work: byDay.size,
    },
    running_now: running,
    by_day: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        tracked_seconds: d.seconds,
        tracked_hours: hours(d.seconds),
        sessions: d.sessions,
        first_start: toWibIso(d.first),
        last_stop: toWibIso(d.last),
        ticket_ids: [...d.tickets],
      })),
    by_company: [...byCompany.values()]
      .sort((a, b) => b.seconds - a.seconds)
      .map((c) => ({ company: c.name, tracked_seconds: c.seconds, tracked_hours: hours(c.seconds), tickets: c.tickets.size })),
    tickets: [...byTicket.entries()]
      .sort(([, a], [, b]) => b.seconds - a.seconds)
      .map(([id, t]) => ({
        id,
        title: t.title,
        status: t.status,
        company: t.company,
        tracked_seconds: t.seconds,
        tracked_hours: hours(t.seconds),
        sessions: t.sessions,
        first_start: toWibIso(t.first),
        last_stop: toWibIso(t.last),
        job_types: [...t.jobTypes],
        url: `${siteUrl()}/tickets/${id}`,
      })),
    ...(withSessions ? { sessions: sessionsOut } : {}),
    calendar_entries: mine.map((e) => ({ type: e.type, title: e.title, start_date: e.start_date, end_date: e.end_date })),
    assigned_open_tickets: plate.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      company: t.companyName ?? null,
      due_date: toWibIso(t.dueDate),
      url: `${siteUrl()}/tickets/${t.id}`,
    })),
  })
}

