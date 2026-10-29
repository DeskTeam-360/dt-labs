import { and, asc, eq, gte, lte, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { CALENDAR_EVENT_TYPES, type CalendarEventOut, type CalendarEventType, placeInYear } from '@/lib/calendar-events'
import { calendarEvents, companies, db, holidays, tickets, users } from '@/lib/db'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&scope=mine|all (staff)
 * Tickets that are due in the range (mine = assigned to the caller) and the holidays in it.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!role || role === 'customer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const from = q.get('from') ?? ''
  const to = q.get('to') ?? ''
  if (!YMD.test(from) || !YMD.test(to)) return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 })
  const mine = q.get('scope') !== 'all'

  // Due dates are shown on the WIB calendar day.
  const start = new Date(`${from}T00:00:00+07:00`)
  const end = new Date(`${to}T23:59:59.999+07:00`)

  const conditions = [gte(tickets.dueDate, start), lte(tickets.dueDate, end), eq(tickets.ticketType, 'support')]
  if (mine) {
    conditions.push(sql`EXISTS (SELECT 1 FROM ticket_assignees ta WHERE ta.ticket_id = ${tickets.id} AND ta.user_id = ${session.user.id})`)
  }

  const [rows, holidayRows, eventRows] = await Promise.all([
    db
      .select({ id: tickets.id, title: tickets.title, dueDate: tickets.dueDate, status: tickets.status, priority: tickets.priority, companyName: companies.name })
      .from(tickets)
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(and(...conditions))
      .orderBy(asc(tickets.dueDate))
      .limit(1000),
    db.select({ date: holidays.holidayDate, name: holidays.name }).from(holidays).where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to))),
    // Entries that overlap the range, plus every yearly one (placed into the years of the range below).
    db
      .select({ e: calendarEvents, userName: users.fullName, userEmail: users.email })
      .from(calendarEvents)
      .leftJoin(users, eq(calendarEvents.userId, users.id))
      .where(or(eq(calendarEvents.repeatYearly, true), and(lte(calendarEvents.startDate, to), gte(calendarEvents.endDate, from)))),
  ])

  const years = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])]
  const events: CalendarEventOut[] = []
  for (const r of eventRows) {
    const e = r.e
    const spans = e.repeatYearly ? years.map((y) => placeInYear(e.startDate, e.endDate, y)) : [{ start: e.startDate, end: e.endDate }]
    for (const sp of spans) {
      if (sp.end < from || sp.start > to) continue
      events.push({
        id: e.id,
        type: (CALENDAR_EVENT_TYPES.includes(e.type as CalendarEventType) ? e.type : 'event') as CalendarEventType,
        title: e.title,
        start_date: sp.start,
        end_date: sp.end,
        user_id: e.userId,
        user_name: r.userName || r.userEmail || null,
        repeat_yearly: e.repeatYearly,
        notes: e.notes,
        origin_start: e.startDate,
        origin_end: e.endDate,
      })
    }
  }

  return NextResponse.json({
    tickets: rows.map((r) => ({
      id: r.id,
      title: r.title,
      due_date: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      status: r.status,
      priority: r.priority,
      company_name: r.companyName ?? null,
    })),
    holidays: holidayRows,
    events,
    can_edit: ['admin', 'operations', 'manager'].includes(role),
  })
}

