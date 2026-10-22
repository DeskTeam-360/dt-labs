import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { db, shifts } from '@/lib/db'
import { parseShiftBody, shiftToDto } from '@/lib/shifts'

async function guard() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

/** PUT /api/shifts/[id] { title, start, end, description? } - admin only. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const parsed = parseShiftBody(await request.json().catch(() => ({})))
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    const [row] = await db
      .update(shifts)
      .set({ title: parsed.title, startTime: parsed.start, endTime: parsed.end, description: parsed.description })
      .where(eq(shifts.id, (await params).id))
      .returning()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(shiftToDto(row))
  } catch {
    return NextResponse.json({ error: 'A shift with this title already exists' }, { status: 409 })
  }
}

/** DELETE /api/shifts/[id] - admin only. People on this shift are left without a shift. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard()
  if (denied) return denied
  await db.delete(shifts).where(eq(shifts.id, (await params).id))
  return NextResponse.json({ ok: true })
}
