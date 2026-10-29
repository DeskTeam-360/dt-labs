import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isInternalUser } from '@/lib/auth-utils'
import { db, googleCalendarConnections } from '@/lib/db'
import { disconnectGoogleCalendar, isGoogleCalendarConfigured } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

async function gate() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isInternalUser((session.user as { role?: string }).role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

/** GET /api/calendar/google -> { configured, connected, email } for the signed-in team member. */
export async function GET() {
  const g = await gate()
  if (g.error) return g.error
  const [conn] = await db.select({ email: googleCalendarConnections.googleEmail }).from(googleCalendarConnections).where(eq(googleCalendarConnections.userId, g.userId)).limit(1)
  return NextResponse.json({ configured: isGoogleCalendarConfigured(), connected: !!conn, email: conn?.email ?? null })
}

/** DELETE /api/calendar/google - disconnect the Google account. */
export async function DELETE() {
  const g = await gate()
  if (g.error) return g.error
  await disconnectGoogleCalendar(g.userId)
  return NextResponse.json({ ok: true })
}
