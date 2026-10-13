import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import { db, holidays, userDailyCapacity, users } from '@/lib/db'

/** Roles whose time counts toward team capacity. */
export const CAPACITY_ROLES = ['admin', 'manager', 'staff'] as const
export const DEFAULT_WORK_HOURS = 8

export const CAPACITY_REASONS = ['work', 'weekend', 'holiday', 'leave', 'sick', 'piket', 'other'] as const
export type CapacityReason = (typeof CAPACITY_REASONS)[number]

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

export function isValidYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !YMD_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Today's calendar date in WIB (UTC+7, no DST), as YYYY-MM-DD. */
export function wibTodayYmd(now: number = Date.now()): string {
  return new Date(now + WIB_OFFSET_MS).toISOString().slice(0, 10)
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function listYmd(from: string, to: string): string[] {
  const out: string[] = []
  for (let cur = from; cur <= to && out.length < 800; cur = addDaysYmd(cur, 1)) out.push(cur)
  return out
}

export function isWeekendYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return dow === 0 || dow === 6
}

export type CapacityUser = {
  id: string
  status: string | null
  joinedAt: string | null
  leftAt: string | null
}

/** Was this user employed (counted) on `ymd`? `left_at` is the last working day. */
export function isEmployedOn(u: CapacityUser, ymd: string): boolean {
  if (u.joinedAt && ymd < u.joinedAt) return false
  if (u.leftAt) return ymd <= u.leftAt
  return (u.status ?? 'active') === 'active'
}

export function defaultCapacityFor(ymd: string, holidayDates: Set<string>): { hours: number; reason: CapacityReason } {
  if (holidayDates.has(ymd)) return { hours: 0, reason: 'holiday' }
  if (isWeekendYmd(ymd)) return { hours: 0, reason: 'weekend' }
  return { hours: DEFAULT_WORK_HOURS, reason: 'work' }
}

async function holidaySet(from: string, to: string): Promise<Set<string>> {
  const rows = await db
    .select({ d: holidays.holidayDate })
    .from(holidays)
    .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to)))
  return new Set(rows.map((r) => r.d))
}

/**
 * Create the default capacity row for every active admin/manager/staff on `ymd`.
 * Existing rows (auto or manual) are never overwritten. Returns the number of rows inserted.
 */
export async function ensureCapacityForDate(ymd: string): Promise<number> {
  const holi = await holidaySet(ymd, ymd)
  const def = defaultCapacityFor(ymd, holi)
  const rows = await db
    .select({ id: users.id, status: users.status, joinedAt: users.joinedAt, leftAt: users.leftAt })
    .from(users)
    .where(
      and(
        eq(users.status, 'active'),
        sql`${users.deletedAt} is null`,
        sql`lower(${users.role}) in ('admin','manager','staff')`
      )
    )
  const eligible = rows.filter((u) => isEmployedOn(u, ymd))
  if (eligible.length === 0) return 0
  const inserted = await db
    .insert(userDailyCapacity)
    .values(
      eligible.map((u) => ({
        userId: u.id,
        capacityDate: ymd,
        hours: String(def.hours),
        reason: def.reason,
        source: 'auto',
      }))
    )
    .onConflictDoNothing({ target: [userDailyCapacity.userId, userDailyCapacity.capacityDate] })
    .returning({ id: userDailyCapacity.id })
  return inserted.length
}

/**
 * Call after a user's status / role / joined_at / left_at changed:
 * inactive users lose their rows from today on; active ones get today's default row.
 */
export async function syncUserCapacityFromToday(userId: string): Promise<void> {
  const [u] = await db
    .select({ id: users.id, status: users.status, role: users.role, deletedAt: users.deletedAt, joinedAt: users.joinedAt, leftAt: users.leftAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!u) return
  const today = wibTodayYmd()
  const counts = (CAPACITY_ROLES as readonly string[]).includes((u.role ?? '').toLowerCase())
  const active = counts && !u.deletedAt && isEmployedOn(u, today)

  if (!active) {
    await db
      .delete(userDailyCapacity)
      .where(and(eq(userDailyCapacity.userId, userId), gte(userDailyCapacity.capacityDate, today)))
    return
  }
  const holi = await holidaySet(today, today)
  const def = defaultCapacityFor(today, holi)
  await db
    .insert(userDailyCapacity)
    .values({ userId, capacityDate: today, hours: String(def.hours), reason: def.reason, source: 'auto' })
    .onConflictDoNothing({ target: [userDailyCapacity.userId, userDailyCapacity.capacityDate] })
}

/**
 * Capacity hours per user over [startYmd, endYmd] (WIB dates). Days without a stored row fall back to
 * the default (weekday 8h, weekend/holiday 0h) while the user was employed.
 */
export async function getCapacityHoursByUser(
  userIds: string[],
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (userIds.length === 0) return result
  const [userRows, capRows, holi] = await Promise.all([
    db
      .select({ id: users.id, status: users.status, joinedAt: users.joinedAt, leftAt: users.leftAt })
      .from(users)
      .where(inArray(users.id, userIds)),
    db
      .select({ userId: userDailyCapacity.userId, d: userDailyCapacity.capacityDate, hours: userDailyCapacity.hours })
      .from(userDailyCapacity)
      .where(
        and(
          inArray(userDailyCapacity.userId, userIds),
          gte(userDailyCapacity.capacityDate, startYmd),
          lte(userDailyCapacity.capacityDate, endYmd)
        )
      ),
    holidaySet(startYmd, endYmd),
  ])
  const stored = new Map<string, number>()
  for (const r of capRows) stored.set(`${r.userId}|${r.d}`, Number(r.hours) || 0)
  const days = listYmd(startYmd, endYmd)
  for (const u of userRows) {
    let total = 0
    for (const d of days) {
      const key = `${u.id}|${d}`
      if (stored.has(key)) {
        total += stored.get(key)!
      } else if (isEmployedOn(u, d)) {
        total += defaultCapacityFor(d, holi).hours
      }
    }
    result.set(u.id, total)
  }
  return result
}

/**
 * Daily capacity per user over [startYmd, endYmd] (WIB dates): stored row, else the default while employed.
 * Returns user → date → { hours, reason }; days when the user was not employed are omitted.
 */
export async function getCapacityDaily(
  userIds: string[],
  startYmd: string,
  endYmd: string
): Promise<Map<string, Map<string, { hours: number; reason: string }>>> {
  const out = new Map<string, Map<string, { hours: number; reason: string }>>()
  if (userIds.length === 0) return out
  const [userRows, capRows, holi] = await Promise.all([
    db
      .select({ id: users.id, status: users.status, joinedAt: users.joinedAt, leftAt: users.leftAt })
      .from(users)
      .where(inArray(users.id, userIds)),
    db
      .select({
        userId: userDailyCapacity.userId,
        d: userDailyCapacity.capacityDate,
        hours: userDailyCapacity.hours,
        reason: userDailyCapacity.reason,
      })
      .from(userDailyCapacity)
      .where(
        and(
          inArray(userDailyCapacity.userId, userIds),
          gte(userDailyCapacity.capacityDate, startYmd),
          lte(userDailyCapacity.capacityDate, endYmd)
        )
      ),
    holidaySet(startYmd, endYmd),
  ])
  const stored = new Map(capRows.map((r) => [`${r.userId}|${r.d}`, r]))
  const days = listYmd(startYmd, endYmd)
  for (const u of userRows) {
    const m = new Map<string, { hours: number; reason: string }>()
    for (const d of days) {
      const row = stored.get(`${u.id}|${d}`)
      if (row) m.set(d, { hours: Number(row.hours) || 0, reason: row.reason })
      else if (isEmployedOn(u, d)) m.set(d, defaultCapacityFor(d, holi))
    }
    out.set(u.id, m)
  }
  return out
}
