import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketNotifications } from '@/lib/db'

/** POST /api/notifications/delete { ids } - deletes the chosen notifications of the logged-in user. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = String(session.user.id).trim()

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown }
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0))].slice(0, 200) : []
  if (ids.length === 0) return NextResponse.json({ ok: true, deleted: 0 })

  try {
    const removed = await db
      .delete(ticketNotifications)
      .where(and(eq(ticketNotifications.userId, uid), inArray(ticketNotifications.id, ids)))
      .returning({ id: ticketNotifications.id })
    return NextResponse.json({ ok: true, deleted: removed.length })
  } catch {
    return NextResponse.json({ error: 'Failed to delete', deleted: 0 }, { status: 500 })
  }
}
