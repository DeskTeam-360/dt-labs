import { auth } from '@/auth'
import { db, ticketTimeTracker, users } from '@/lib/db'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/tickets/[id]/time-tracker - List sessions. ?active=1 = current user's active session only */
export async function GET(
  request: Request,
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

  const url = new URL(request.url)
  const activeOnly = url.searchParams.get('active') === '1'

  const whereClause = activeOnly
    ? and(
        eq(ticketTimeTracker.ticketId, ticketId),
        eq(ticketTimeTracker.userId, session.user.id),
        isNull(ticketTimeTracker.stopTime)
      )
    : eq(ticketTimeTracker.ticketId, ticketId)

  const rows = await db
    .select({
      tracker: ticketTimeTracker,
      user: users,
    })
    .from(ticketTimeTracker)
    .leftJoin(users, eq(ticketTimeTracker.userId, users.id))
    .where(whereClause)
    .orderBy(desc(ticketTimeTracker.createdAt))
    .limit(activeOnly ? 1 : 100)

  const result = rows.map((r) => ({
    ...r.tracker,
    start_time: r.tracker.startTime,
    stop_time: r.tracker.stopTime,
    duration_seconds: r.tracker.durationSeconds,
    user: r.user ? { id: r.user.id, full_name: r.user.fullName, email: r.user.email } : null,
  }))

  return NextResponse.json(activeOnly ? (result[0] ?? null) : result)
}

/** POST /api/tickets/[id]/time-tracker - Start or stop */
export async function POST(
  request: Request,
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

  const body = await request.json()
  const action = body.action // 'start' | 'stop'

  if (action === 'start') {
    // Check for existing active session
    const active = await db
      .select()
      .from(ticketTimeTracker)
      .where(and(eq(ticketTimeTracker.userId, session.user.id), isNull(ticketTimeTracker.stopTime)))
    if (active.length > 0) {
      return NextResponse.json(
        { error: 'You have an active time tracking session. Please stop it first.' },
        { status: 400 }
      )
    }

    const [row] = await db
      .insert(ticketTimeTracker)
      .values({
        ticketId: ticketId,
        userId: session.user.id,
        startTime: new Date(),
      })
      .returning()

    return NextResponse.json(row)
  }

  if (action === 'stop') {
    const { session_id } = body
    const stopTime = new Date()

    const [active] = await db
      .select()
      .from(ticketTimeTracker)
      .where(eq(ticketTimeTracker.id, session_id))

    if (!active || active.userId !== session.user.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const startTime = new Date(active.startTime)
    let durationSeconds = Math.floor((stopTime.getTime() - startTime.getTime()) / 1000)
    const MAX = 2147483647
    if (durationSeconds > MAX) durationSeconds = MAX
    if (durationSeconds < 0) durationSeconds = 0

    await db
      .update(ticketTimeTracker)
      .set({ stopTime, durationSeconds })
      .where(eq(ticketTimeTracker.id, session_id))

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
