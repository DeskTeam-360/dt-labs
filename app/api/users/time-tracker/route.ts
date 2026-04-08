import { auth } from '@/auth'
import { db, ticketTimeTracker, tickets } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { eq, and, desc, gte, lte, isNull, isNotNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/users/time-tracker?user_id=xxx&filter=week|month|all&start=&end=&stopped_only=1&active_only=1&limit=15 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const userId = url.searchParams.get('user_id')
  const filter = url.searchParams.get('filter') || 'all'
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const stoppedOnly = url.searchParams.get('stopped_only') === '1'
  const activeOnly = url.searchParams.get('active_only') === '1'
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 100) : 100

  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  const conditions = [eq(ticketTimeTracker.userId, userId)]
  if (filter === 'week' && start) {
    conditions.push(gte(ticketTimeTracker.startTime, new Date(start)))
  } else if (filter === 'month' && start) {
    conditions.push(gte(ticketTimeTracker.startTime, new Date(start)))
  } else if (filter === 'custom' && start && end) {
    conditions.push(gte(ticketTimeTracker.startTime, new Date(start)))
    conditions.push(lte(ticketTimeTracker.startTime, new Date(end)))
  }
  if (stoppedOnly) {
    conditions.push(isNotNull(ticketTimeTracker.stopTime))
  }
  if (activeOnly) {
    conditions.push(isNull(ticketTimeTracker.stopTime))
    conditions.push(eq(ticketTimeTracker.trackerType, 'timer'))
  }

  const rows = await db
    .select({
      tracker: ticketTimeTracker,
      ticket: tickets,
    })
    .from(ticketTimeTracker)
    .leftJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .where(and(...conditions))
    .orderBy(desc(ticketTimeTracker.startTime))
    .limit(limit)

  const result = rows.map((r) => ({
    id: r.tracker.id,
    ticket_id: r.tracker.ticketId,
    user_id: r.tracker.userId,
    tracker_type: r.tracker.trackerType,
    start_time: r.tracker.startTime ? new Date(r.tracker.startTime).toISOString() : null,
    stop_time: r.tracker.stopTime ? new Date(r.tracker.stopTime).toISOString() : null,
    duration_seconds: r.tracker.durationSeconds,
    duration_adjustment: r.tracker.durationAdjustment,
    reported_duration_seconds: reportedDurationSeconds({
      durationSeconds: r.tracker.durationSeconds,
      durationAdjustment: r.tracker.durationAdjustment,
    }),
    created_at: r.tracker.createdAt ? new Date(r.tracker.createdAt).toISOString() : null,
    ticket: r.ticket
      ? {
          id: r.ticket.id,
          title: r.ticket.title,
          description: r.ticket.description,
        }
      : null,
  }))

  return NextResponse.json(result)
}
