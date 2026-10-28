import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { parseScheduleBody } from '@/lib/crawl-schedule-input'
import { nextRunFor } from '@/lib/crawl-schedule-runner'
import { db } from '@/lib/db'
import { crawlSchedules } from '@/lib/db/schema'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id || session.user.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const [cur] = await db.select().from(crawlSchedules).where(eq(crawlSchedules.id, id)).limit(1)
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = parseScheduleBody((await req.json()) as Record<string, unknown>)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const merged = { ...cur, ...parsed.values }
  const next = merged.isActive ? nextRunFor(merged, new Date()) : null
  const [row] = await db
    .update(crawlSchedules)
    .set({ ...parsed.values, nextRunAt: next, updatedAt: new Date() })
    .where(eq(crawlSchedules.id, id))
    .returning()
  return NextResponse.json({ data: row })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id || session.user.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  await db.delete(crawlSchedules).where(eq(crawlSchedules.id, id))
  return NextResponse.json({ success: true })
}
