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
        isNull(ticketTimeTracker.stopTime),
        eq(ticketTimeTracker.trackerType, 'timer')
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
    tracker_type: r.tracker.trackerType,
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
    const [row] = await db
      .insert(ticketTimeTracker)
      .values({
        ticketId: ticketId,
        userId: session.user.id,
        trackerType: 'timer',
        startTime: new Date(),
      })
      .returning()

    return NextResponse.json({
      ...row,
      tracker_type: row.trackerType,
      start_time: row.startTime,
      stop_time: row.stopTime,
      duration_seconds: row.durationSeconds,
    })
  }

  if (action === 'manual') {
    const durationSecondsRaw = body.duration_seconds
    const startedAtRaw = body.started_at ?? body.recorded_at
    const startedAt = startedAtRaw ? new Date(startedAtRaw as string) : new Date()
    const durationSeconds =
      typeof durationSecondsRaw === 'number'
        ? Math.floor(durationSecondsRaw)
        : parseInt(String(durationSecondsRaw), 10)
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return NextResponse.json({ error: 'duration_seconds must be a positive number' }, { status: 400 })
    }
    if (Number.isNaN(startedAt.getTime())) {
      return NextResponse.json({ error: 'Invalid started_at' }, { status: 400 })
    }
    const MAX = 2147483647
    const capped = Math.min(durationSeconds, MAX)
    const startTime = startedAt
    const stopTime = new Date(startedAt.getTime() + capped * 1000)
    const nowMs = Date.now()
    if (startTime.getTime() > nowMs || stopTime.getTime() > nowMs) {
      return NextResponse.json(
        { error: 'Worked time cannot be in the future (max: now)' },
        { status: 400 }
      )
    }

    const [row] = await db
      .insert(ticketTimeTracker)
      .values({
        ticketId,
        userId: session.user.id,
        trackerType: 'manual',
        startTime,
        stopTime,
        durationSeconds: capped,
      })
      .returning()

    return NextResponse.json({
      ...row,
      tracker_type: row.trackerType,
      start_time: row.startTime,
      stop_time: row.stopTime,
      duration_seconds: row.durationSeconds,
    })
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
    if (active.trackerType !== 'timer') {
      return NextResponse.json({ error: 'Only timer sessions can be stopped here' }, { status: 400 })
    }
    if (active.stopTime) {
      return NextResponse.json({ error: 'Session already stopped' }, { status: 400 })
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

const MAX_DURATION = 2147483647

/** PATCH — edit completed entry (own rows only). Body: { session_id, start_time, stop_time } ISO strings. Sets tracker_type to manual. */
export async function PATCH(
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

  const body = await request.json().catch(() => ({}))
  const sessionId = body.session_id as string | undefined
  const startRaw = body.start_time as string | undefined
  const stopRaw = body.stop_time as string | undefined

  if (!sessionId || !startRaw || !stopRaw) {
    return NextResponse.json(
      { error: 'session_id, start_time, and stop_time are required' },
      { status: 400 }
    )
  }

  const [row] = await db
    .select()
    .from(ticketTimeTracker)
    .where(eq(ticketTimeTracker.id, sessionId))
    .limit(1)

  if (!row || row.ticketId !== ticketId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (row.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!row.stopTime) {
    return NextResponse.json(
      { error: 'Stop the timer before editing this entry' },
      { status: 400 }
    )
  }

  const startTime = new Date(startRaw)
  const stopTime = new Date(stopRaw)
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(stopTime.getTime())) {
    return NextResponse.json({ error: 'Invalid start_time or stop_time' }, { status: 400 })
  }
  if (stopTime.getTime() <= startTime.getTime()) {
    return NextResponse.json({ error: 'stop_time must be after start_time' }, { status: 400 })
  }

  const nowMs = Date.now()
  if (startTime.getTime() > nowMs || stopTime.getTime() > nowMs) {
    return NextResponse.json(
      { error: 'start_time and stop_time cannot be in the future (max: now)' },
      { status: 400 }
    )
  }

  let durationSeconds = Math.floor((stopTime.getTime() - startTime.getTime()) / 1000)
  if (durationSeconds > MAX_DURATION) durationSeconds = MAX_DURATION
  if (durationSeconds < 1) {
    return NextResponse.json({ error: 'Duration must be at least 1 second' }, { status: 400 })
  }

  const [updated] = await db
    .update(ticketTimeTracker)
    .set({ startTime, stopTime, durationSeconds, trackerType: 'manual' })
    .where(eq(ticketTimeTracker.id, sessionId))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({
    ...updated,
    tracker_type: updated.trackerType,
    start_time: updated.startTime,
    stop_time: updated.stopTime,
    duration_seconds: updated.durationSeconds,
  })
}

/** DELETE — remove entry (own rows). Query: ?session_id=uuid. Active timer rows can be deleted to discard. */
export async function DELETE(
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

  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id query required' }, { status: 400 })
  }

  const [row] = await db
    .select()
    .from(ticketTimeTracker)
    .where(eq(ticketTimeTracker.id, sessionId))
    .limit(1)

  if (!row || row.ticketId !== ticketId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (row.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.delete(ticketTimeTracker).where(eq(ticketTimeTracker.id, sessionId))

  return NextResponse.json({ ok: true })
}
