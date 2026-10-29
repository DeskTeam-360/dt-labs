import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { CALENDAR_EVENT_TYPES, type CalendarEventType } from '@/lib/calendar-events'
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

/** POST /api/calendar/events - Admin, Operations and Team Leader add entries. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = parseEventBody((await request.json().catch(() => ({}))) as Record<string, unknown>, true)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const v = parsed.values
  const [row] = await db
    .insert(calendarEvents)
    .values({ ...v, type: v.type!, title: v.title!, startDate: v.startDate!, endDate: v.endDate!, createdBy: session.user.id })
    .returning({ id: calendarEvents.id })
  return NextResponse.json({ id: row.id }, { status: 201 })
}
