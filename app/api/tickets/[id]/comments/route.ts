import { auth } from '@/auth'
import { db, ticketComments, commentAttachments } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const body = await request.json()
  const { comment, visibility = 'reply', author_type = 'agent', attachments = [] } = body

  const [row] = await db
    .insert(ticketComments)
    .values({
      ticketId,
      userId: session.user.id,
      comment: comment || '',
      visibility,
      authorType: author_type,
    })
    .returning()

  if (!row) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  if (attachments.length > 0) {
    await db.insert(commentAttachments).values(
      attachments.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        commentId: row.id,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: session.user.id,
      }))
    )
  }

  return NextResponse.json({
    id: row.id,
    ticket_id: row.ticketId,
    user_id: row.userId,
    comment: row.comment,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    visibility: row.visibility ?? 'reply',
    author_type: row.authorType ?? 'agent',
    user: { id: session.user.id, full_name: session.user.name, email: session.user.email, avatar_url: session.user.image },
    comment_attachments: attachments.map((a: { file_url: string; file_name: string }) => ({ id: '', file_url: a.file_url, file_name: a.file_name })),
  })
}
