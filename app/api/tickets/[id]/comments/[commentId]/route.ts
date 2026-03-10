import { auth } from '@/auth'
import { db, ticketComments, commentAttachments } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PATCH /api/tickets/[id]/comments/[commentId] - Update comment */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { commentId } = await params
  const body = await request.json()
  const { comment } = body

  await db
    .update(ticketComments)
    .set({ comment: comment ?? '' })
    .where(eq(ticketComments.id, commentId))

  return NextResponse.json({ ok: true })
}

/** DELETE /api/tickets/[id]/comments/[commentId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { commentId } = await params
  await db.delete(commentAttachments).where(eq(commentAttachments.commentId, commentId))
  await db.delete(ticketComments).where(eq(ticketComments.id, commentId))
  return NextResponse.json({ ok: true })
}
