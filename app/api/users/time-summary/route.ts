import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'

type Period = 'today' | 'week' | 'month' | 'last_month'

export type UserTimeSummary = {
  periods: Record<Period, { seconds: number; tickets: number }>
  /** Running timers; each adds one second per second to the periods that end "now". */
  running_count: number
  computed_at: string
}

function parseDate(v: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * GET /api/users/time-summary?today_start=&week_start=&month_start=&last_month_start=
 * Reported time of the signed-in user per period. Bounds are the viewer's local midnights (ISO).
 * Running timers count up to now; sessions crossing a boundary only count the part inside it.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const todayStart = parseDate(url.searchParams.get('today_start'))
  const weekStart = parseDate(url.searchParams.get('week_start'))
  const monthStart = parseDate(url.searchParams.get('month_start'))
  const lastMonthStart = parseDate(url.searchParams.get('last_month_start'))
  if (!todayStart || !weekStart || !monthStart || !lastMonthStart) {
    return NextResponse.json(
      { error: 'today_start, week_start, month_start and last_month_start are required (ISO dates)' },
      { status: 400 }
    )
  }

  const now = new Date()
  const bounds: Record<Period, { start: string; end: string }> = {
    today: { start: todayStart.toISOString(), end: now.toISOString() },
    week: { start: weekStart.toISOString(), end: now.toISOString() },
    month: { start: monthStart.toISOString(), end: now.toISOString() },
    last_month: { start: lastMonthStart.toISOString(), end: monthStart.toISOString() },
  }

  // Reported seconds are spread evenly over the session's wall-clock span, then clipped to each period.
  const overlap = (p: Period) =>
    sql`GREATEST(0, EXTRACT(EPOCH FROM (LEAST(en, ${bounds[p].end}::timestamptz) - GREATEST(st, ${bounds[p].start}::timestamptz))))`
  const periodSum = (p: Period) => sql`COALESCE(SUM(rep * ${overlap(p)} / NULLIF(wall, 0)), 0)::float8`
  const periodTickets = (p: Period) => sql`COUNT(DISTINCT ticket_id) FILTER (WHERE ${overlap(p)} > 0)::int`

  const result = await db.execute<{
    today_s: number; week_s: number; month_s: number; last_month_s: number
    today_t: number; week_t: number; month_t: number; last_month_t: number
    running: number
  }>(sql`
    WITH s AS (
      SELECT
        ticket_id,
        start_time AS st,
        COALESCE(stop_time, ${bounds.today.end}::timestamptz) AS en,
        EXTRACT(EPOCH FROM (COALESCE(stop_time, ${bounds.today.end}::timestamptz) - start_time)) AS wall,
        CASE
          WHEN stop_time IS NULL THEN EXTRACT(EPOCH FROM (${bounds.today.end}::timestamptz - start_time))
          ELSE GREATEST(0, COALESCE(duration_adjustment, duration_seconds, 0))
        END AS rep,
        (stop_time IS NULL) AS is_running
      FROM ticket_time_tracker
      WHERE user_id = ${session.user.id}
        AND start_time < ${bounds.today.end}::timestamptz
        AND COALESCE(stop_time, ${bounds.today.end}::timestamptz) > ${bounds.last_month.start}::timestamptz
    )
    SELECT
      ${periodSum('today')} AS today_s,
      ${periodSum('week')} AS week_s,
      ${periodSum('month')} AS month_s,
      ${periodSum('last_month')} AS last_month_s,
      ${periodTickets('today')} AS today_t,
      ${periodTickets('week')} AS week_t,
      ${periodTickets('month')} AS month_t,
      ${periodTickets('last_month')} AS last_month_t,
      COUNT(*) FILTER (WHERE is_running)::int AS running
    FROM s
  `)

  const row = (Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows?.[0]) as
    | Record<string, number>
    | undefined
  const num = (v: unknown) => Math.floor(Number(v) || 0)

  const body: UserTimeSummary = {
    periods: {
      today: { seconds: num(row?.today_s), tickets: num(row?.today_t) },
      week: { seconds: num(row?.week_s), tickets: num(row?.week_t) },
      month: { seconds: num(row?.month_s), tickets: num(row?.month_t) },
      last_month: { seconds: num(row?.last_month_s), tickets: num(row?.last_month_t) },
    },
    running_count: num(row?.running),
    computed_at: now.toISOString(),
  }
  return NextResponse.json(body)
}
