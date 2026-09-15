import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { commentAttachments,db, ticketComments } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
import { logTicketActivity } from '@/lib/ticket-activity-log'

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

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { comment } = body

  const [prev] = await db
    .select({ comment: ticketComments.comment, userId: ticketComments.userId, visibility: ticketComments.visibility })
    .from(ticketComments)
    .where(eq(ticketComments.id, commentId))
    .limit(1)

  if (!prev) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  // Only allow editing another agent's comment if it is a note
  const isOwnComment = prev.userId === session.user.id
  if (!isOwnComment && prev.visibility !== 'note') {
    return NextResponse.json({ error: 'Cannot edit another agent\'s reply' }, { status: 403 })
  }

  const now = new Date()
  await db
    .update(ticketComments)
    .set({
      comment: comment ?? '',
      editedByUserId: session.user.id!,
      editedAt: now,
    })
    .where(eq(ticketComments.id, commentId))

  const actorRole: TicketActorRole = 'agent'
  if (String(prev.comment ?? '') !== String(comment ?? '')) {
    await logTicketActivity({
      ticketId,
      actorUserId: session.user.id!,
      actorRole,
      action: 'comment_updated',
      relatedCommentId: commentId,
      metadata: {
        body_preview: String(comment ?? '').replace(/<[^>]+>/g, ' ').trim().slice(0, 200),
        edited_other: !isOwnComment,
      },
    })
  }

  bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true, editedByUserId: session.user.id, editedAt: now.toISOString() })
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
  bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}
