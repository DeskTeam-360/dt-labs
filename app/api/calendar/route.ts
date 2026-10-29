import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import type { CalendarEventOut } from '@/lib/calendar-events'
import { loadCalendarEntries } from '@/lib/calendar-query'
import { calendarGoogleLinks, companies, db, tickets } from '@/lib/db'

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

  const [rows, entries] = await Promise.all([
    db
      .select({ id: tickets.id, title: tickets.title, dueDate: tickets.dueDate, status: tickets.status, priority: tickets.priority, companyName: companies.name })
      .from(tickets)
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(and(...conditions))
      .orderBy(asc(tickets.dueDate))
      .limit(1000),
    loadCalendarEntries(from, to),
  ])

  const mySynced = new Set(
    (await db.select({ id: calendarGoogleLinks.eventId }).from(calendarGoogleLinks).where(eq(calendarGoogleLinks.userId, session.user.id))).map((r) => r.id)
  )

  const events: CalendarEventOut[] = entries.events.map((e) => ({ ...e, synced: mySynced.has(e.id) }))

  return NextResponse.json({
    tickets: rows.map((r) => ({
      id: r.id,
      title: r.title,
      due_date: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      status: r.status,
      priority: r.priority,
      company_name: r.companyName ?? null,
    })),
    holidays: entries.holidays,
    events,
    can_edit: ['admin', 'operations'].includes(role),
  })
}

