import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketChecklist, users } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { mapChecklistItemToDto } from '@/lib/ticket-checklist-map'

/** PATCH /api/tickets/[id]/checklist/[itemId] - Toggle or update checklist item */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, itemId } = await params
  const ticketId = parseInt(id, 10)
  const body = await request.json().catch(() => ({}))

  const updates: Partial<typeof ticketChecklist.$inferInsert> = {}

  if (body.is_completed !== undefined) {
    const completing = Boolean(body.is_completed)
    updates.isCompleted = completing
    if (completing) {
      updates.completedAt = new Date()
      updates.completedByUserId = session.user.id
      if (body.completion_note !== undefined) {
        const note =
          typeof body.completion_note === 'string' ? body.completion_note.trim() : ''
        updates.completionNote = note.length > 0 ? note : null
      }
    } else {
      updates.completedAt = null
      updates.completedByUserId = null
    }
  }

  if (body.title !== undefined) {
    updates.title = String(body.title)
  }

  if (body.completion_note !== undefined && body.is_completed === undefined) {
    const note = typeof body.completion_note === 'string' ? body.completion_note.trim() : ''
    updates.completionNote = note.length > 0 ? note : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 })
  }

  const [row] = await db
    .update(ticketChecklist)
    .set(updates)
    .where(eq(ticketChecklist.id, itemId))
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let completer: { id: string; fullName: string | null; email: string } | undefined
  if (row.completedByUserId) {
    const [u] = await db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(eq(users.id, row.completedByUserId))
      .limit(1)
    completer = u
  }

  if (!isNaN(ticketId)) bumpTicketDataVersion(ticketId)
  return NextResponse.json(mapChecklistItemToDto(row, completer))
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

  const { id, itemId } = await params
  const ticketId = parseInt(id, 10)
  await db.delete(ticketChecklist).where(eq(ticketChecklist.id, itemId))
  if (!isNaN(ticketId)) bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}
