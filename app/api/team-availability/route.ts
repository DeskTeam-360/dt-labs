import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, holidays, userDailyCapacity, users } from '@/lib/db'
import {
  addDaysYmd,
  CAPACITY_REASONS,
  DEFAULT_WORK_HOURS,
  defaultCapacityFor,
  isEmployedOn,
  isValidYmd,
  listYmd,
  wibTodayYmd,
} from '@/lib/user-capacity'

const MONTH_RE = /^\d{4}-\d{2}$/

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const from = `${month}-01`
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  return { from, to }
}

export type AvailabilityCell = { h: number; r: string; s: 'default' | 'auto' | 'manual' } | null

/**
 * GET /api/team-availability?month=YYYY-MM  (admin)
 * Grid data: one entry per admin/manager/staff, one cell per day of the month (null = not employed that day).
 */
export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const month = new URL(request.url).searchParams.get('month') ?? wibTodayYmd().slice(0, 7)
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
  const { from, to } = monthRange(month)
  const days = listYmd(from, to)

  const userRows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      position: users.position,
      status: users.status,
      joinedAt: users.joinedAt,
      leftAt: users.leftAt,
    })
    .from(users)
    .where(
      and(
        sql`lower(${users.role}) in ('admin','manager','staff')`,
        sql`${users.deletedAt} is null`,
        or(eq(users.status, 'active'), gte(users.leftAt, from))
      )
    )
    .orderBy(users.fullName)

  const ids = userRows.map((u) => u.id)
  const [capRows, holiRows] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(userDailyCapacity)
          .where(
            and(
              inArray(userDailyCapacity.userId, ids),
              gte(userDailyCapacity.capacityDate, from),
              lte(userDailyCapacity.capacityDate, to)
            )
          )
      : Promise.resolve([]),
    db
      .select({ d: holidays.holidayDate, name: holidays.name })
      .from(holidays)
      .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to))),
  ])
  const holiDates = new Set(holiRows.map((h) => h.d))
  const stored = new Map(capRows.map((r) => [`${r.userId}|${r.capacityDate}`, r]))

  const out = userRows.map((u) => {
    const cells: AvailabilityCell[] = days.map((d) => {
      const row = stored.get(`${u.id}|${d}`)
      if (row) return { h: Number(row.hours) || 0, r: row.reason, s: row.source === 'manual' ? 'manual' : 'auto' }
      if (!isEmployedOn(u, d)) return null
      const def = defaultCapacityFor(d, holiDates)
      return { h: def.hours, r: def.reason, s: 'default' }
    })
    return {
      id: u.id,
      name: u.fullName || u.email,
      role: u.role,
      position: u.position,
      joined_at: u.joinedAt,
      left_at: u.leftAt,
      cells,
    }
  })

  return NextResponse.json({
    month,
    days,
    today: wibTodayYmd(),
    holidays: holiRows.map((h) => ({ date: h.d, name: h.name })),
    users: out,
  })
}

const KINDS = ['normal', 'leave', 'sick', 'piket', 'other'] as const
type Kind = (typeof KINDS)[number]

/**
 * PUT /api/team-availability  (admin)
 * Body: { user_ids: string[], from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', kind: 'normal'|'leave'|'sick'|'piket'|'other', hours?: number }
 * - normal: reset to the default for that day (weekday 8h, weekend/holiday 0h)
 * - leave / sick: 0h (or `hours` for a half day) on working days only (weekends/holidays are skipped)
 * - piket: `hours` (default 8) on every day in the range
 * - other: `hours` (default 0) on every day in the range
 * Days when the user was not employed are skipped. Past dates are editable.
 */
export async function PUT(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const body = (await request.json().catch(() => null)) as {
    user_ids?: unknown
    from?: unknown
    to?: unknown
    kind?: unknown
    hours?: unknown
  } | null
  const userIds = Array.isArray(body?.user_ids) ? [...new Set(body!.user_ids.map(String))] : []
  const from = body?.from
  const to = body?.to ?? body?.from
  const kind = body?.kind as Kind
  if (userIds.length === 0 || !isValidYmd(from) || !isValidYmd(to) || to < from || !KINDS.includes(kind)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const days = listYmd(from, to)
  if (days.length > 62) return NextResponse.json({ error: 'Range too large (max 62 days)' }, { status: 400 })

  let hoursInput: number | null = null
  if (body?.hours !== undefined && body.hours !== null && body.hours !== '') {
    hoursInput = Number(body.hours)
    if (!Number.isFinite(hoursInput) || hoursInput < 0 || hoursInput > 24) {
      return NextResponse.json({ error: 'hours must be between 0 and 24' }, { status: 400 })
    }
  }

  const [userRows, holiRows] = await Promise.all([
    db
      .select({ id: users.id, status: users.status, joinedAt: users.joinedAt, leftAt: users.leftAt })
      .from(users)
      .where(inArray(users.id, userIds)),
    db
      .select({ d: holidays.holidayDate })
      .from(holidays)
      .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to))),
  ])
  const holiDates = new Set(holiRows.map((h) => h.d))

  const values: (typeof userDailyCapacity.$inferInsert)[] = []
  for (const u of userRows) {
    for (const d of days) {
      if (!isEmployedOn(u, d)) continue
      const def = defaultCapacityFor(d, holiDates)
      const offDay = def.hours === 0
      let hours: number
      let reason: string
      let source: 'auto' | 'manual' = 'manual'
      if (kind === 'normal') {
        hours = def.hours
        reason = def.reason
        source = 'auto'
      } else if (kind === 'leave' || kind === 'sick') {
        if (offDay) continue
        hours = hoursInput ?? 0
        reason = kind
      } else if (kind === 'piket') {
        hours = hoursInput ?? DEFAULT_WORK_HOURS
        reason = 'piket'
      } else {
        hours = hoursInput ?? 0
        reason = 'other'
      }
      values.push({
        userId: u.id,
        capacityDate: d,
        hours: String(hours),
        reason: CAPACITY_REASONS.includes(reason as never) ? reason : 'other',
        source,
        updatedBy: gate.userId,
        updatedAt: new Date(),
      })
    }
  }
  if (values.length === 0) return NextResponse.json({ ok: true, updated: 0 })

  await db
    .insert(userDailyCapacity)
    .values(values)
    .onConflictDoUpdate({
      target: [userDailyCapacity.userId, userDailyCapacity.capacityDate],
      set: {
        hours: sql`excluded.hours`,
        reason: sql`excluded.reason`,
        source: sql`excluded.source`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`excluded.updated_at`,
      },
    })

  return NextResponse.json({ ok: true, updated: values.length, next_day: addDaysYmd(to, 1) })
}
