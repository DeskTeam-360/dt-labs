import { asc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { db, shifts, users } from '@/lib/db'
import { parseShiftBody, shiftToDto } from '@/lib/shifts'

/** GET /api/shifts - shift catalog with how many people are on each (admin, manager, staff). */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [rows, counts] = await Promise.all([
    db.select().from(shifts).orderBy(asc(shifts.startTime), asc(shifts.title)),
    db
      .select({ shiftId: users.shiftId, n: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.shiftId} is not null`)
      .groupBy(users.shiftId),
  ])
  const countBy = new Map(counts.map((c) => [c.shiftId, Number(c.n)]))
  return NextResponse.json(rows.map((r) => ({ ...shiftToDto(r), people: countBy.get(r.id) ?? 0 })))
}

/** POST /api/shifts { title, start, end, description? } - admin only. Times are WIB, "HH:MM". */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = parseShiftBody(await request.json().catch(() => ({})))
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    const [row] = await db
      .insert(shifts)
      .values({ title: parsed.title, startTime: parsed.start, endTime: parsed.end, description: parsed.description })
      .returning()
    return NextResponse.json({ ...shiftToDto(row), people: 0 })
  } catch (e) {
    const exists = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.title, parsed.title)).limit(1)
    if (exists.length > 0) return NextResponse.json({ error: 'A shift with this title already exists' }, { status: 409 })
    console.error('[POST /api/shifts] failed:', e)
    return NextResponse.json(
      { error: 'Could not save the shift. Check that migration 076_shifts.sql was run and the table belongs to the app database user.' },
      { status: 500 }
    )
  }
}
