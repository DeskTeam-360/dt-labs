import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { daysBetween, eachDay, loadCalendarEntries } from '@/lib/calendar-query'
import { loadDueTickets } from '@/lib/calendar-tickets'
import { db, users } from '@/lib/db'

export const dynamic = 'force-dynamic'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 62
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Today as a WIB calendar date. */
const todayWib = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)

/**
 * GET /api/calendar/user-status?email=person@company.com&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Looks a team member up by email and says, day by day, whether they are on leave, on duty, have a birthday,
 * or whether it is a holiday or weekend. `from` and `to` default to today; at most 62 days.
 * Auth: browser session, or an API key with the `calendar:read` scope (`Authorization: Bearer dtk_...`, made on the API Keys page).
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'calendar:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const email = (q.get('email') ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })
  const from = q.get('from') ?? todayWib()
  const to = q.get('to') ?? from
  if (!YMD.test(from) || !YMD.test(to)) return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 })
  if (to < from) return NextResponse.json({ error: 'to is before from' }, { status: 400 })
  if (daysBetween(from, to) > MAX_DAYS) return NextResponse.json({ error: `The range can be at most ${MAX_DAYS} days` }, { status: 400 })

  const [person] = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role, status: users.status })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)
  // Customers are not part of the team calendar.
  if (!person || !isTeamRole((person.role ?? '').toLowerCase())) return NextResponse.json({ error: 'No team member with that email' }, { status: 404 })

  // include=tickets adds the person's unfinished tickets by due day; that is ticket data, so the key needs the Tickets scope too.
  const includeTickets = (q.get('include') ?? '').split(',').includes('tickets')
  if (includeTickets && !(await getApiUser(request, 'tickets:read', { log: false }))) {
    return NextResponse.json({ error: 'include=tickets needs a key that also has Tickets (read)' }, { status: 403 })
  }
  const dueTickets = includeTickets ? await loadDueTickets(me, from, to, { email: person.email, unfinishedOnly: true }) : []

  const { events, holidays } = await loadCalendarEntries(from, to)
  const holidayOn = (d: string) => {
    const fromTable = holidays.find((h) => h.date === d)?.name
    const fromEntry = events.find((e) => e.type === 'holiday' && e.start_date <= d && e.end_date >= d)?.title
    return fromTable ?? fromEntry ?? null
  }

  const days = eachDay(from, to).map((date) => {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    // Entries of this person that cover the day (leave, duty, birthday, other).
    const mine = events.filter((e) => e.user_id === person.id && e.start_date <= date && e.end_date >= date)
    const holiday = holidayOn(date)
    const isWeekend = dow === 0 || dow === 6
    const onLeave = mine.some((e) => e.type === 'leave')
    return {
      date,
      weekday: WEEKDAYS[dow],
      is_weekend: isWeekend,
      holiday,
      on_leave: onLeave,
      on_duty: mine.some((e) => e.type === 'duty'),
      birthday: mine.some((e) => e.type === 'birthday'),
      /** Not a weekend, not a holiday and not on leave */
      available: !isWeekend && !holiday && !onLeave,
      entries: mine.map((e) => ({ id: e.id, type: e.type, title: e.title, notes: e.notes })),
      ...(includeTickets ? { tickets_due: dueTickets.filter((t) => t.due_day === date) } : {}),
    }
  })

  return NextResponse.json({
    user: { id: person.id, full_name: person.fullName, email: person.email, role: person.role, status: person.status },
    from,
    to,
    summary: {
      days: days.length,
      available_days: days.filter((d) => d.available).length,
      leave_days: days.filter((d) => d.on_leave).length,
      duty_days: days.filter((d) => d.on_duty).length,
      holiday_days: days.filter((d) => d.holiday).length,
      ...(includeTickets ? { tickets_due: dueTickets.length, tickets_due_on_unavailable_days: days.filter((d) => !d.available).reduce((n, d) => n + (d.tickets_due?.length ?? 0), 0) } : {}),
    },
    days,
  })
}
