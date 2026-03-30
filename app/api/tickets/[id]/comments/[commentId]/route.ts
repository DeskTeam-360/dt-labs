import { auth } from '@/auth'
import { db, ticketComments, commentAttachments } from '@/lib/db'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
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

  const { id, commentId } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const body = await request.json()
  const { comment } = body

  const [prev] = await db
    .select({ comment: ticketComments.comment })
    .from(ticketComments)
    .where(eq(ticketComments.id, commentId))
    .limit(1)

  await db
    .update(ticketComments)
    .set({ comment: comment ?? '' })
    .where(eq(ticketComments.id, commentId))

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  if (prev && String(prev.comment ?? '') !== String(comment ?? '')) {
    await logTicketActivity({
      ticketId,
      actorUserId: session.user.id!,
      actorRole,
      action: 'comment_updated',
      relatedCommentId: commentId,
      metadata: { body_preview: String(comment ?? '').replace(/<[^>]+>/g, ' ').trim().slice(0, 200) },
    })
  }

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

  const { id, commentId } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id!,
    actorRole,
    action: 'comment_deleted',
    relatedCommentId: commentId,
    metadata: { comment_id: commentId },
  })

  await db.delete(commentAttachments).where(eq(commentAttachments.commentId, commentId))
  await db.delete(ticketComments).where(eq(ticketComments.id, commentId))
  return NextResponse.json({ ok: true })
}
