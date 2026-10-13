import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketNotifications } from '@/lib/db'

/** Delete all notifications of the logged-in user that are already read. */
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const uid = String(session.user.id).trim()

  try {
    const removed = await db
      .delete(ticketNotifications)
      .where(and(eq(ticketNotifications.userId, uid), eq(ticketNotifications.read, true)))
      .returning({ id: ticketNotifications.id })
    return NextResponse.json({ ok: true, deleted: removed.length })
  } catch {
    return NextResponse.json({ error: 'Failed to delete', deleted: 0 }, { status: 500 })
  }
}
