import { and, eq, gte, lte, or } from 'drizzle-orm'

import { CALENDAR_EVENT_TYPES, type CalendarEventOut, type CalendarEventType, placeInYear } from '@/lib/calendar-events'
import { calendarEvents, db, holidays, users } from '@/lib/db'

export type CalendarHolidayOut = { date: string; name: string }

/**
 * The calendar's own entries and the holidays that fall in [from, to] (YYYY-MM-DD).
 * A yearly entry is placed in each year the range touches; entries come back one per occurrence.
 */
export async function loadCalendarEntries(from: string, to: string): Promise<{ events: CalendarEventOut[]; holidays: CalendarHolidayOut[] }> {
  const [holidayRows, eventRows] = await Promise.all([
    db.select({ date: holidays.holidayDate, name: holidays.name }).from(holidays).where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to))),
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
        user_email: r.userEmail ?? null,
        repeat_yearly: e.repeatYearly,
        notes: e.notes,
        origin_start: e.startDate,
        origin_end: e.endDate,
      })
    }
  }
  events.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title))
  return { events, holidays: holidayRows }
}

const MS_DAY = 86400000

/** Whole days between two YYYY-MM-DD dates, inclusive of both ends. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_DAY) + 1
}

/** The dates from..to as YYYY-MM-DD (the caller keeps the range small). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += MS_DAY) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}
