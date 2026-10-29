import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isInternalUser } from '@/lib/auth-utils'
import { pushEventsForUser } from '@/lib/google-calendar'

/** POST /api/calendar/google/push { event_ids } - sends the chosen entries to the caller's own Google Calendar. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isInternalUser((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { event_ids?: unknown }
  const ids = [...new Set((Array.isArray(body.event_ids) ? body.event_ids : []).map(String))].slice(0, 500)
  if (ids.length === 0) return NextResponse.json({ error: 'Choose at least one entry' }, { status: 400 })
  const result = await pushEventsForUser(session.user.id, ids)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
