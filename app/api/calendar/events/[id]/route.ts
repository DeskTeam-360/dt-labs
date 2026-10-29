import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { calendarEvents, db } from '@/lib/db'

import { parseEventBody } from '../route'

type Ctx = { params: Promise<{ id: string }> }

async function gate() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await gate()
  if (denied) return denied
  const { id } = await ctx.params
  const [cur] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = parseEventBody((await request.json().catch(() => ({}))) as Record<string, unknown>, false)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const end = parsed.values.endDate ?? cur.endDate
  const start = parsed.values.startDate ?? cur.startDate
  if (end < start) return NextResponse.json({ error: 'The end date is before the start date' }, { status: 400 })
  await db.update(calendarEvents).set(parsed.values).where(eq(calendarEvents.id, id))
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const denied = await gate()
  if (denied) return denied
  const { id } = await ctx.params
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id))
  return NextResponse.json({ ok: true })
}
