import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketNotifications, users } from '@/lib/db'

/** How many notifications the bell shows (newest first). */
const LIMIT = 5

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const uid = String(session.user.id).trim()

  try {
    const [rows, [{ unread }]] = await Promise.all([
      db
        .select()
        .from(ticketNotifications)
        .where(eq(ticketNotifications.userId, uid))
        .orderBy(desc(ticketNotifications.createdAt))
        .limit(LIMIT),
      db
        .select({ unread: sql<number>`count(*)::int` })
        .from(ticketNotifications)
        .where(and(eq(ticketNotifications.userId, uid), eq(ticketNotifications.read, false))),
    ])

    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => Boolean(v)))]
    const avatarRows = actorIds.length
      ? await db.select({ id: users.id, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, actorIds))
      : []
    const avatarById = new Map(avatarRows.map((a) => [a.id, a.avatarUrl]))

    const items = rows.map((r) => ({
      id: r.id,
      ticketId: r.ticketId,
      ticketTitle: r.ticketTitle,
      type: r.type,
      title: r.title,
      body: r.body,
      read: r.read,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      actorUserId: r.actorUserId ?? '',
      actorName: r.actorName,
      actorAvatarUrl: (r.actorUserId ? avatarById.get(r.actorUserId) : null) ?? null,
    }))
    return NextResponse.json({ items, unread_total: unread })
  } catch {
    return NextResponse.json({ items: [], unread_total: 0, error: 'fetch_failed' })
  }
}
