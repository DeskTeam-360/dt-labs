import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { isAdminOrOperations } from '@/lib/auth-utils'
import { CALENDAR_EVENT_TYPES, type CalendarEventType } from '@/lib/calendar-events'
import { daysBetween, loadCalendarEntries } from '@/lib/calendar-query'
import { loadAssignedTickets, loadDueTickets } from '@/lib/calendar-tickets'
import { calendarEvents, db } from '@/lib/db'

const YMD = /^\d{4}-\d{2}-\d{2}$/

type Parsed = { values: Partial<typeof calendarEvents.$inferInsert> } | { error: string }

/** Reads and checks an event body (shared by create and update). */
export function parseEventBody(b: Record<string, unknown>, requireAll: boolean): Parsed {
  const v: Partial<typeof calendarEvents.$inferInsert> = {}
  if (b.type !== undefined || requireAll) {
    if (!CALENDAR_EVENT_TYPES.includes(String(b.type) as CalendarEventType)) return { error: 'Choose a type' }
    v.type = String(b.type)
  }
  if (b.title !== undefined || requireAll) {
    const t = String(b.title ?? '').trim().slice(0, 200)
    if (!t) return { error: 'Title is required' }
    v.title = t
  }
  if (b.start_date !== undefined || requireAll) {
    if (!YMD.test(String(b.start_date))) return { error: 'Start date is required' }
    v.startDate = String(b.start_date)
  }
  if (b.end_date !== undefined || requireAll) {
    if (!YMD.test(String(b.end_date))) return { error: 'End date is required' }
    v.endDate = String(b.end_date)
  }
  if (v.startDate && v.endDate && v.endDate < v.startDate) return { error: 'The end date is before the start date' }
  if (b.user_id !== undefined) v.userId = b.user_id ? String(b.user_id) : null
  if (b.repeat_yearly !== undefined) v.repeatYearly = Boolean(b.repeat_yearly)
  if (b.notes !== undefined) v.notes = b.notes ? String(b.notes).slice(0, 2000) : null
  return { values: v }
}

/** POST /api/calendar/events - Admin and Operations add entries. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrOperations((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = parseEventBody((await request.json().catch(() => ({}))) as Record<string, unknown>, true)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const v = parsed.values
  const [row] = await db
    .insert(calendarEvents)
    .values({ ...v, type: v.type!, title: v.title!, startDate: v.startDate!, endDate: v.endDate!, createdBy: session.user.id })
    .returning({ id: calendarEvents.id })
  return NextResponse.json({ id: row.id }, { status: 201 })
}

const MAX_RANGE_DAYS = 366

/**
 * GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&type=leave,duty&email=person@company.com
 * The calendar entries and holidays in a date range. `type` (birthday, holiday, leave, duty, event) and `email`
 * (whose entries) are optional filters; yearly entries are placed in each year of the range. At most 366 days.
 * include=tickets also returns tickets_due (with `email`: only tickets assigned to that person; done=0: unfinished only);
 * that needs the Tickets scope as well.
 * Auth: browser session, or an API key with the `calendar:read` scope (`Authorization: Bearer dtk_...`, made on the API Keys page).
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'calendar:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const from = q.get('from') ?? ''
  const to = q.get('to') ?? ''
  if (!YMD.test(from) || !YMD.test(to)) return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 })
  if (to < from) return NextResponse.json({ error: 'to is before from' }, { status: 400 })
  if (daysBetween(from, to) > MAX_RANGE_DAYS) return NextResponse.json({ error: `The range can be at most ${MAX_RANGE_DAYS} days` }, { status: 400 })

  const types = (q.get('type') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  const bad = types.filter((t) => !CALENDAR_EVENT_TYPES.includes(t as CalendarEventType))
  if (bad.length) return NextResponse.json({ error: `Unknown type: ${bad.join(', ')}. Use ${CALENDAR_EVENT_TYPES.join(', ')}` }, { status: 400 })
  const email = (q.get('email') ?? '').trim().toLowerCase()

  // include=tickets adds the tickets that are due in the range; that is ticket data, so the key needs the Tickets scope too.
  const include = (q.get('include') ?? '').split(',')
  const includeTickets = include.includes('tickets')
  const includeAssigned = include.includes('assigned_tickets')
  if ((includeTickets || includeAssigned) && !(await getApiUser(request, 'tickets:read', { log: false }))) {
    return NextResponse.json({ error: 'include=tickets and include=assigned_tickets need a key that also has Tickets (read)' }, { status: 403 })
  }
  const unfinishedOnly = q.get('done') === '0'

  const { events, holidays } = await loadCalendarEntries(from, to)
  const filtered = events.filter((e) => (types.length === 0 || types.includes(e.type)) && (!email || (e.user_email ?? '').toLowerCase() === email))
  // The people on leave in this range and what each of them still has assigned.
  const leavePeople = includeAssigned ? [...new Set(filtered.filter((e) => e.type === 'leave' && e.user_id).map((e) => e.user_id as string))] : []
  const plates = await loadAssignedTickets(me, leavePeople)
  const includeHolidays = !email && (types.length === 0 || types.includes('holiday'))

  return NextResponse.json({
    from,
    to,
    events: filtered.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      start_date: e.start_date,
      end_date: e.end_date,
      user_full_name: e.user_name,
      ...(includeAssigned && e.type === 'leave' && e.user_id ? { assigned_tickets_total: plates.get(e.user_id)?.total ?? 0, assigned_tickets: plates.get(e.user_id)?.tickets.map(({ assignees, ...t }) => { void assignees; return t }) ?? [] } : {}),
      user_email: e.user_email ?? null,
      repeat_yearly: e.repeat_yearly,
      notes: e.notes,
    })),
    holidays: includeHolidays ? holidays : [],
    ...(includeTickets ? { tickets_due: await loadDueTickets(me, from, to, { email: email || undefined, unfinishedOnly }) } : {}),
  })
}
