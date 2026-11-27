import { NextResponse } from 'next/server'

import { apiUnauthorized, getApiUser, isTeamRole } from '@/lib/api-auth'
import { loadCalendarEntries } from '@/lib/calendar-query'

export const dynamic = 'force-dynamic'

const DAY = 86400000
const WINDOW_DAYS = 14
/** Today as a WIB calendar date. */
const todayWib = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

/** GET /api/dashboard/team-leave - who is on leave today or in the next 14 days (team only). */
export async function GET(request: Request) {
  const me = await getApiUser(request)
  if (!me) return apiUnauthorized(request)
  if (!isTeamRole(me.role)) return NextResponse.json({ data: [] })

  const from = todayWib()
  const to = addDays(from, WINDOW_DAYS)
  const { events } = await loadCalendarEntries(from, to)
  const data = events
    .filter((e) => e.type === 'leave' && e.user_id)
    .map((e) => ({
      id: e.id,
      user_id: e.user_id as string,
      name: e.user_name ?? 'Team member',
      start_date: e.start_date,
      end_date: e.end_date,
      title: e.title,
      days: Math.round((Date.parse(`${e.end_date}T00:00:00Z`) - Date.parse(`${e.start_date}T00:00:00Z`)) / DAY) + 1,
      starts_in: Math.round((Date.parse(`${e.start_date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY),
    }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name))
  return NextResponse.json({ from, to, data })
}
