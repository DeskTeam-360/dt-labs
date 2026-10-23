import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { db, shifts, users } from '@/lib/db'

async function guard() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

/**
 * POST /api/shifts/[id]/members { user_ids } - admin only.
 * Puts these people on this shift. Anyone who was on a different shift is moved, and the answer lists who
 * (with the shift they left) so the screen can say so.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const shiftId = (await params).id
  const body = (await request.json().catch(() => ({}))) as { user_ids?: unknown }
  const ids = [...new Set((Array.isArray(body.user_ids) ? body.user_ids : []).map((v) => String(v)))]
  if (ids.length === 0) return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 })

  const [target] = await db.select({ id: shifts.id }).from(shifts).where(eq(shifts.id, shiftId)).limit(1)
  if (!target) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  // Who is on another shift right now (for the "moved" list); customers can never be on a shift.
  const [people, titles] = await Promise.all([
    db
      .select({ id: users.id, name: users.fullName, email: users.email, role: users.role, shiftId: users.shiftId })
      .from(users)
      .where(inArray(users.id, ids)),
    db.select({ id: shifts.id, title: shifts.title }).from(shifts),
  ])
  const staff = people.filter((p) => (p.role ?? '').toLowerCase() !== 'customer')
  const titleById = new Map(titles.map((t) => [t.id, t.title]))
  const moved = staff
    .filter((p) => p.shiftId && p.shiftId !== shiftId)
    .map((p) => ({ id: p.id, name: p.name || p.email, from_shift: titleById.get(p.shiftId!) ?? 'another shift' }))

  await db.update(users).set({ shiftId, updatedAt: new Date() }).where(inArray(users.id, staff.map((p) => p.id)))
  return NextResponse.json({ added: staff.length, moved })
}

/** DELETE /api/shifts/[id]/members?user_id=... - takes one person off this shift (admin only). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const shiftId = (await params).id
  const userId = new URL(request.url).searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  await db
    .update(users)
    .set({ shiftId: null, updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.shiftId, shiftId), isNotNull(users.shiftId), ne(users.role, 'customer')))
  return NextResponse.json({ ok: true })
}
