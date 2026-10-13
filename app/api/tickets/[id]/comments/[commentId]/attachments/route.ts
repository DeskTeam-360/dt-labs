import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { commentAttachments, db, ticketComments } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import type { TicketActorRole } from '@/lib/ticket-activity-log'
import { logTicketActivity } from '@/lib/ticket-activity-log'

/**
 * POST /api/tickets/[id]/comments/[commentId]/attachments
 * Body: { attachments: [{ file_url, file_name, file_path }] } — files already uploaded to storage.
 * Same edit rules as PATCH comment: own comment, or another agent's note.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, commentId } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const list = Array.isArray(body?.attachments) ? body.attachments : []
  const items = list
    .map((a: { file_url?: string; file_name?: string; file_path?: string }) => ({
      fileUrl: String(a?.file_url ?? '').trim(),
      fileName: String(a?.file_name ?? '').trim(),
      filePath: String(a?.file_path ?? '').trim(),
    }))
    .filter((a: { fileUrl: string; fileName: string }) => a.fileUrl && a.fileName)
  if (items.length === 0) {
    return NextResponse.json({ error: 'No attachments provided' }, { status: 400 })
  }

  const [comment] = await db
    .select({ userId: ticketComments.userId, visibility: ticketComments.visibility })
    .from(ticketComments)
    .where(and(eq(ticketComments.id, commentId), eq(ticketComments.ticketId, ticketId)))
    .limit(1)
  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }
  if (comment.userId !== session.user.id && comment.visibility !== 'note') {
    return NextResponse.json({ error: "Cannot edit another agent's reply" }, { status: 403 })
  }

  const inserted = await db
    .insert(commentAttachments)
    .values(items.map((a: { fileUrl: string; fileName: string; filePath: string }) => ({ commentId, ...a, uploadedBy: session.user!.id! })))
    .returning({
      id: commentAttachments.id,
      fileUrl: commentAttachments.fileUrl,
      fileName: commentAttachments.fileName,
    })

  const actorRole: TicketActorRole = 'agent'
  await logTicketActivity({
    ticketId,
    actorUserId: session.user.id,
    actorRole,
    action: 'comment_attachment_added',
    relatedCommentId: commentId,
    metadata: { file_names: items.map((a: { fileName: string }) => a.fileName) },
  })

  bumpTicketDataVersion(ticketId)
  return NextResponse.json({
    attachments: inserted.map((r) => ({ id: r.id, file_url: r.fileUrl ?? '', file_name: r.fileName ?? '' })),
  })
}
