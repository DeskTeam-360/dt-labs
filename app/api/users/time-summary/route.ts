import { eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, users } from '@/lib/db'

type Period = 'today' | 'week' | 'month' | 'last_month'

export type UserTimeSummary = {
  periods: Record<Period, { seconds: number; tickets: number }>
  /** Running timers; each adds one second per second to the periods that end "now". */
  running_count: number
  /** IANA zone the periods were cut in (the user's profile timezone). */
  timezone: string
  computed_at: string
}

function validTimezone(tz: string | null | undefined): string {
  const candidate = tz?.trim() || 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate })
    return candidate
  } catch {
    return 'UTC'
  }
}

/**
 * GET /api/users/time-summary
 * Reported time of the signed-in user for today / this week (from Monday) / this month / last month,
 * cut at midnight in the user's profile timezone. Running timers count up to now; sessions crossing
 * a boundary only count the part inside the period.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [profile] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, session.user.id)).limit(1)
  const tz = validTimezone(profile?.timezone)

  // Period starts as timestamptz: truncate the local wall-clock time, then convert back from the zone.
  const result = await db.execute(sql`
    WITH b AS (
      SELECT
        now() AS now_ts,
        date_trunc('day',   now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS today_start,
        date_trunc('week',  now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS week_start,
        date_trunc('month', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz} AS month_start,
        (date_trunc('month', now() AT TIME ZONE ${tz}) - interval '1 month') AT TIME ZONE ${tz} AS last_month_start
    ),
    s AS (
      SELECT
        t.ticket_id,
        t.start_time AS st,
        COALESCE(t.stop_time, b.now_ts) AS en,
        EXTRACT(EPOCH FROM (COALESCE(t.stop_time, b.now_ts) - t.start_time)) AS wall,
        CASE
          WHEN t.stop_time IS NULL THEN EXTRACT(EPOCH FROM (b.now_ts - t.start_time))
          ELSE GREATEST(0, COALESCE(t.duration_adjustment, t.duration_seconds, 0))
        END AS rep,
        (t.stop_time IS NULL) AS is_running
      FROM ticket_time_tracker t, b
      WHERE t.user_id = ${session.user.id}
        AND t.start_time < b.now_ts
        AND COALESCE(t.stop_time, b.now_ts) > b.last_month_start
    ),
    o AS (
      SELECT s.ticket_id, s.rep, s.wall, s.is_running,
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(s.en, b.now_ts)      - GREATEST(s.st, b.today_start))))      AS today_o,
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(s.en, b.now_ts)      - GREATEST(s.st, b.week_start))))       AS week_o,
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(s.en, b.now_ts)      - GREATEST(s.st, b.month_start))))      AS month_o,
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(s.en, b.month_start) - GREATEST(s.st, b.last_month_start)))) AS last_month_o
      FROM s, b
    )
    SELECT
      COALESCE(SUM(rep * today_o      / NULLIF(wall, 0)), 0)::float8 AS today_s,
      COALESCE(SUM(rep * week_o       / NULLIF(wall, 0)), 0)::float8 AS week_s,
      COALESCE(SUM(rep * month_o      / NULLIF(wall, 0)), 0)::float8 AS month_s,
      COALESCE(SUM(rep * last_month_o / NULLIF(wall, 0)), 0)::float8 AS last_month_s,
      COUNT(DISTINCT ticket_id) FILTER (WHERE today_o > 0)::int      AS today_t,
      COUNT(DISTINCT ticket_id) FILTER (WHERE week_o > 0)::int       AS week_t,
      COUNT(DISTINCT ticket_id) FILTER (WHERE month_o > 0)::int      AS month_t,
      COUNT(DISTINCT ticket_id) FILTER (WHERE last_month_o > 0)::int AS last_month_t,
      COUNT(*) FILTER (WHERE is_running)::int                        AS running
    FROM o
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
    timezone: tz,
    computed_at: new Date().toISOString(),
  }
  return NextResponse.json(body)
}
