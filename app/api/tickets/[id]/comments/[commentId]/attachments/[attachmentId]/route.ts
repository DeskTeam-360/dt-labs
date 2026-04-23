import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { commentAttachments, db, ticketComments } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { deleteObject } from '@/lib/storage-idrive'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
import { logTicketActivity } from '@/lib/ticket-activity-log'

/** DELETE /api/tickets/[id]/comments/[commentId]/attachments/[attachmentId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string; attachmentId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, commentId, attachmentId } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const [comment] = await db
    .select({
      id: ticketComments.id,
      ticketId: ticketComments.ticketId,
      userId: ticketComments.userId,
    })
    .from(ticketComments)
    .where(and(eq(ticketComments.id, commentId), eq(ticketComments.ticketId, ticketId)))
    .limit(1)

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }
  if (comment.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [att] = await db
    .select({
      id: commentAttachments.id,
      filePath: commentAttachments.filePath,
      fileName: commentAttachments.fileName,
    })
    .from(commentAttachments)
    .where(and(eq(commentAttachments.id, attachmentId), eq(commentAttachments.commentId, commentId)))
    .limit(1)

  if (!att) {
    return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
  }

  await db.delete(commentAttachments).where(eq(commentAttachments.id, attachmentId))

  const fp = att.filePath?.trim()
  if (fp) {
    const result = await deleteObject(fp.replace(/^\/+/, ''))
    if (!result.ok) {
      console.error('[DELETE comment attachment] storage', result.error)
    }
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const actorRole: TicketActorRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id,
    actorRole,
    action: 'comment_attachment_deleted',
    relatedCommentId: commentId,
    metadata: { file_name: att.fileName ?? '' },
  })

  bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}
