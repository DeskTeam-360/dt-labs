import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketNotifications } from '@/lib/db'

/** Mark notifications as read: `{ ids: string[] }` or `{ all: true }` for every unread one. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const uid = String(session.user.id).trim()

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown; all?: unknown }
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((x): x is string => typeof x === 'string' && x.length > 0))].slice(0, 100)
    : []

  if (body.all !== true && ids.length === 0) {
    return NextResponse.json({ ok: true })
  }

  try {
    await db
      .update(ticketNotifications)
      .set({ read: true, readAt: new Date() })
      .where(
        and(
          eq(ticketNotifications.userId, uid),
          eq(ticketNotifications.read, false),
          ...(body.all === true ? [] : [inArray(ticketNotifications.id, ids)])
        )
      )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}
