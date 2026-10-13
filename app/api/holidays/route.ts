import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, holidays, userDailyCapacity } from '@/lib/db'
import { defaultCapacityFor, isValidYmd } from '@/lib/user-capacity'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

/** Reset automatic (non-manual) capacity rows on one date to the current default. */
async function resetAutoRowsForDate(ymd: string) {
  const [h] = await db.select({ d: holidays.holidayDate }).from(holidays).where(eq(holidays.holidayDate, ymd)).limit(1)
  const def = defaultCapacityFor(ymd, new Set(h ? [ymd] : []))
  await db
    .update(userDailyCapacity)
    .set({ hours: String(def.hours), reason: def.reason, updatedAt: new Date() })
    .where(and(eq(userDailyCapacity.capacityDate, ymd), eq(userDailyCapacity.source, 'auto')))
}

/** GET /api/holidays?year=YYYY (admin) */
export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const year = new URL(request.url).searchParams.get('year') ?? String(new Date().getUTCFullYear())
  if (!/^\d{4}$/.test(year)) return NextResponse.json({ error: 'year must be YYYY' }, { status: 400 })
  const rows = await db
    .select({ date: holidays.holidayDate, name: holidays.name })
    .from(holidays)
    .where(and(gte(holidays.holidayDate, `${year}-01-01`), lte(holidays.holidayDate, `${year}-12-31`)))
    .orderBy(holidays.holidayDate)
  return NextResponse.json({ year, holidays: rows })
}

/** POST /api/holidays  { date, name } (admin) — also zeroes automatic capacity rows on that date. */
export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const body = (await request.json().catch(() => null)) as { date?: unknown; name?: unknown } | null
  const name = String(body?.name ?? '').trim()
  if (!isValidYmd(body?.date) || !name) {
    return NextResponse.json({ error: 'date (YYYY-MM-DD) and name are required' }, { status: 400 })
  }
  await db
    .insert(holidays)
    .values({ holidayDate: body.date, name: name.slice(0, 255), createdBy: gate.userId })
    .onConflictDoUpdate({ target: holidays.holidayDate, set: { name: sql`excluded.name` } })
  await resetAutoRowsForDate(body.date)
  return NextResponse.json({ ok: true })
}

/** DELETE /api/holidays?date=YYYY-MM-DD (admin) */
export async function DELETE(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const date = new URL(request.url).searchParams.get('date')
  if (!isValidYmd(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  await db.delete(holidays).where(eq(holidays.holidayDate, date))
  await resetAutoRowsForDate(date)
  return NextResponse.json({ ok: true })
}
