import { auth } from '@/auth'
import { db, ticketChecklist } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PATCH /api/tickets/[id]/checklist/[itemId] - Toggle or update checklist item */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params
  const body = await request.json()

  if (body.is_completed !== undefined) {
    await db
      .update(ticketChecklist)
      .set({ isCompleted: body.is_completed })
      .where(eq(ticketChecklist.id, itemId))
  }
  if (body.title !== undefined) {
    await db
      .update(ticketChecklist)
      .set({ title: body.title })
      .where(eq(ticketChecklist.id, itemId))
  }

  return NextResponse.json({ ok: true })
}

/** DELETE /api/tickets/[id]/checklist/[itemId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params
  await db.delete(ticketChecklist).where(eq(ticketChecklist.id, itemId))
  return NextResponse.json({ ok: true })
}
