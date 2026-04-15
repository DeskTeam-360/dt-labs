import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketActivityLog, users } from '@/lib/db'

/** GET /api/tickets/[id]/activity - Append-only activity log for this ticket */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const rows = await db
    .select({
      id: ticketActivityLog.id,
      ticket_id: ticketActivityLog.ticketId,
      actor_user_id: ticketActivityLog.actorUserId,
      actor_role: ticketActivityLog.actorRole,
      action: ticketActivityLog.action,
      metadata: ticketActivityLog.metadata,
      related_comment_id: ticketActivityLog.relatedCommentId,
      created_at: ticketActivityLog.createdAt,
      actor_name: users.fullName,
      actor_email: users.email,
      actor_avatar_url: users.avatarUrl,
    })
    .from(ticketActivityLog)
    .leftJoin(users, eq(ticketActivityLog.actorUserId, users.id))
    .where(eq(ticketActivityLog.ticketId, ticketId))
    .orderBy(desc(ticketActivityLog.createdAt))

  const data = rows.map((r) => ({
    id: r.id,
    ticket_id: r.ticket_id,
    actor_user_id: r.actor_user_id,
    actor_role: r.actor_role,
    action: r.action,
    metadata: r.metadata,
    related_comment_id: r.related_comment_id,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    actor: r.actor_user_id
      ? {
          name: r.actor_name ?? null,
          email: r.actor_email ?? null,
          avatar_url: r.actor_avatar_url ?? null,
        }
      : null,
  }))

  return NextResponse.json({ data })
}
