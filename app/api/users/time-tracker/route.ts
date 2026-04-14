import { auth } from '@/auth'
import { db, ticketTimeTracker, tickets } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { eq, and, desc, gte, lte, isNull, isNotNull, sql, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import type { UserTimeTrackerTicketSummary } from '@/lib/user-time-tracker-summary'

/** GET /api/users/time-tracker?user_id=xxx&filter=week|month|all&start=&end=&stopped_only=1&active_only=1&limit=15&include_ticket_summary=1 */
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
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 500) : 100
  const includeTicketSummary = url.searchParams.get('include_ticket_summary') === '1'

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
      joinedTicketId: tickets.id,
      joinedTicketTitle: tickets.title,
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
    ticket:
      r.joinedTicketId != null
        ? {
            id: r.joinedTicketId,
            title: r.joinedTicketTitle,
          }
        : null,
  }))

  if (!includeTicketSummary) {
    return NextResponse.json(result)
  }

  const whereClause = and(...conditions)
  const aggRows = await db
    .select({
      ticketId: ticketTimeTracker.ticketId,
      reported_seconds_total: sql<number>`sum(
        CASE
          WHEN ${ticketTimeTracker.durationAdjustment} IS NOT NULL
          THEN GREATEST(0, ${ticketTimeTracker.durationAdjustment})
          ELSE GREATEST(0, COALESCE(${ticketTimeTracker.durationSeconds}, 0))
        END
      )`.mapWith(Number),
    })
    .from(ticketTimeTracker)
    .where(whereClause)
    .groupBy(ticketTimeTracker.ticketId)

  let topTickets: UserTimeTrackerTicketSummary['top_tickets'] = []
  if (aggRows.length > 0) {
    const sorted = [...aggRows].sort(
      (a, b) => b.reported_seconds_total - a.reported_seconds_total || a.ticketId - b.ticketId
    )
    const topFive = sorted.slice(0, 5)
    const ids = topFive.map((r) => r.ticketId)
    const titleRows =
      ids.length > 0
        ? await db
            .select({ id: tickets.id, title: tickets.title })
            .from(tickets)
            .where(inArray(tickets.id, ids))
        : []
    const idToTitle = new Map(titleRows.map((r) => [r.id, r.title]))
    topTickets = topFive.map((row) => ({
      ticket_id: row.ticketId,
      title: idToTitle.get(row.ticketId) ?? null,
      reported_seconds_total: Math.round(Number(row.reported_seconds_total) || 0),
    }))
  }

  const ticket_summary: UserTimeTrackerTicketSummary = {
    distinct_ticket_count: aggRows.length,
    top_tickets: topTickets,
  }

  return NextResponse.json({ sessions: result, ticket_summary })
}
