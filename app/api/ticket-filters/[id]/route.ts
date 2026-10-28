import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketSavedFilters } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

/** PATCH /api/ticket-filters/[id] { is_default } - makes this view the default (or clears it). Only the owner. */
export async function PATCH(request: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const userId = session.user.id
  const body = (await request.json().catch(() => ({}))) as { is_default?: unknown }
  const [own] = await db.select({ id: ticketSavedFilters.id }).from(ticketSavedFilters).where(and(eq(ticketSavedFilters.id, id), eq(ticketSavedFilters.userId, userId))).limit(1)
  if (!own) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await db.transaction(async (tx) => {
    // The one-default rule: clear the old default first, then set the new one.
    await tx.update(ticketSavedFilters).set({ isDefault: false }).where(eq(ticketSavedFilters.userId, userId))
    if (body.is_default) await tx.update(ticketSavedFilters).set({ isDefault: true }).where(eq(ticketSavedFilters.id, id))
  })
  return NextResponse.json({ ok: true })
}

/** DELETE /api/ticket-filters/[id] - only the owner can remove a view. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  await db.delete(ticketSavedFilters).where(and(eq(ticketSavedFilters.id, id), eq(ticketSavedFilters.userId, session.user.id)))
  return NextResponse.json({ ok: true })
}
