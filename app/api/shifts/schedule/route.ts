import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrOperations } from '@/lib/auth-utils'
import { db, shifts, shiftSchedules, users } from '@/lib/db'
import { applyDueShiftSchedules, todayWib } from '@/lib/shift-schedule'

const YMD = /^\d{4}-\d{2}-\d{2}$/

async function guard() {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAdminOrOperations((session.user as { role?: string }).role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id as string }
}

/** GET /api/shifts/schedule - the periods, one entry per shift + period with the people in it (admin, operations). */
export async function GET() {
  const g = await guard()
  if ('error' in g) return g.error
  await applyDueShiftSchedules()
  const rows = await db
    .select({
      id: shiftSchedules.id,
      shiftId: shiftSchedules.shiftId,
      shiftTitle: shifts.title,
      userId: shiftSchedules.userId,
      name: users.fullName,
      email: users.email,
      startDate: shiftSchedules.startDate,
      endDate: shiftSchedules.endDate,
    })
    .from(shiftSchedules)
    .innerJoin(shifts, eq(shifts.id, shiftSchedules.shiftId))
    .innerJoin(users, eq(users.id, shiftSchedules.userId))
    .orderBy(asc(shiftSchedules.startDate), asc(shifts.title))

  const today = todayWib()
  const groups = new Map<string, { key: string; shift_id: string; shift_title: string; start_date: string; end_date: string; status: 'upcoming' | 'active' | 'past'; people: { id: string; entry_id: string; name: string }[] }>()
  for (const r of rows) {
    const start = String(r.startDate)
    const end = String(r.endDate)
    const key = `${r.shiftId}|${start}|${end}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        shift_id: r.shiftId,
        shift_title: r.shiftTitle,
        start_date: start,
        end_date: end,
        status: end < today ? 'past' : start > today ? 'upcoming' : 'active',
        people: [],
      })
    }
    groups.get(key)!.people.push({ id: r.userId, entry_id: r.id, name: r.name || r.email })
  }
  return NextResponse.json([...groups.values()])
}

/**
 * POST /api/shifts/schedule { shift_id, user_ids, start_date, end_date } (admin, operations).
 * Puts these people on the shift for the period. A person cannot be in two periods that overlap. A period that is running now
 * is applied straight away; a later one is applied on its first day.
 */
export async function POST(request: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const b = (await request.json().catch(() => ({}))) as { shift_id?: unknown; user_ids?: unknown; start_date?: unknown; end_date?: unknown }
  const shiftId = String(b.shift_id ?? '')
  const ids = [...new Set((Array.isArray(b.user_ids) ? b.user_ids : []).map((v) => String(v)))]
  const start = String(b.start_date ?? '')
  const end = String(b.end_date ?? '')
  if (!shiftId) return NextResponse.json({ error: 'Pick a shift' }, { status: 400 })
  if (ids.length === 0) return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 })
  if (!YMD.test(start) || !YMD.test(end)) return NextResponse.json({ error: 'Pick the start and end dates' }, { status: 400 })
  if (end < start) return NextResponse.json({ error: 'The end date cannot be before the start date' }, { status: 400 })

  const [shift] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.id, shiftId)).limit(1)
  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  const people = await db.select({ id: users.id, name: users.fullName, email: users.email, role: users.role }).from(users).where(inArray(users.id, ids))
  const staff = people.filter((p) => (p.role ?? '').toLowerCase() !== 'customer')
  if (staff.length === 0) return NextResponse.json({ error: 'Customers cannot be put on a shift' }, { status: 400 })

  const clash = await db
    .select({ userId: shiftSchedules.userId, start: shiftSchedules.startDate, end: shiftSchedules.endDate })
    .from(shiftSchedules)
    .where(and(inArray(shiftSchedules.userId, staff.map((p) => p.id)), lte(shiftSchedules.startDate, end), gte(shiftSchedules.endDate, start)))
  if (clash.length > 0) {
    const nameOf = new Map(staff.map((p) => [p.id, p.name || p.email]))
    const list = [...new Set(clash.map((c) => `${nameOf.get(c.userId)} (${String(c.start)} to ${String(c.end)})`))]
    return NextResponse.json({ error: `Already scheduled in an overlapping period: ${list.join(', ')}. Remove that period first.` }, { status: 409 })
  }

  await db.insert(shiftSchedules).values(staff.map((p) => ({ shiftId, userId: p.id, startDate: start, endDate: end, createdBy: g.userId })))
  const applied = await applyDueShiftSchedules()
  return NextResponse.json({ added: staff.length, applied_now: applied })
}

/** DELETE /api/shifts/schedule?ids=a,b,c - removes those entries (admin, operations). A shift already applied stays as it is. */
export async function DELETE(request: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ error: 'ids required' }, { status: 400 })
  await db.delete(shiftSchedules).where(inArray(shiftSchedules.id, ids))
  return NextResponse.json({ ok: true })
}
