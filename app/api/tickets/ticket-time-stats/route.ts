import { and, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketTimeTracker, users } from '@/lib/db'

export type TicketTrackerStat = {
  ticket_id: number
  today_seconds: number
  yesterday_seconds: number
  active_trackers: { user_name: string; start_time: string }[]
}

/** GET /api/tickets/ticket-time-stats?ticket_ids=1,2,3 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('ticket_ids') ?? ''
  const ticketIds = raw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
  if (ticketIds.length === 0) return NextResponse.json([])

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)

  const [timeRows, yesterdayRows, activeRows] = await Promise.all([
    db
      .select({
        ticketId: ticketTimeTracker.ticketId,
        totalSeconds: sql<number>`coalesce(sum(
          case
            when ${ticketTimeTracker.durationAdjustment} is not null then ${ticketTimeTracker.durationAdjustment}
            when ${ticketTimeTracker.durationSeconds} is not null then ${ticketTimeTracker.durationSeconds}
            else 0
          end
        ), 0)`.mapWith(Number),
      })
      .from(ticketTimeTracker)
      .where(and(
        inArray(ticketTimeTracker.ticketId, ticketIds),
        gte(ticketTimeTracker.startTime, todayStart),
        isNotNull(ticketTimeTracker.stopTime),
      ))
      .groupBy(ticketTimeTracker.ticketId),
    db
      .select({
        ticketId: ticketTimeTracker.ticketId,
        totalSeconds: sql<number>`coalesce(sum(
          case
            when ${ticketTimeTracker.durationAdjustment} is not null then ${ticketTimeTracker.durationAdjustment}
            when ${ticketTimeTracker.durationSeconds} is not null then ${ticketTimeTracker.durationSeconds}
            else 0
          end
        ), 0)`.mapWith(Number),
      })
      .from(ticketTimeTracker)
      .where(and(
        inArray(ticketTimeTracker.ticketId, ticketIds),
        gte(ticketTimeTracker.startTime, yesterdayStart),
        sql`${ticketTimeTracker.startTime} < ${todayStart}`,
        isNotNull(ticketTimeTracker.stopTime),
      ))
      .groupBy(ticketTimeTracker.ticketId),
    db
      .select({
        ticketId: ticketTimeTracker.ticketId,
        userId: ticketTimeTracker.userId,
        startTime: ticketTimeTracker.startTime,
      })
      .from(ticketTimeTracker)
      .where(and(
        inArray(ticketTimeTracker.ticketId, ticketIds),
        isNull(ticketTimeTracker.stopTime),
      )),
  ])

  const activeUserIds = [...new Set(activeRows.map((r) => r.userId).filter(Boolean))]
  const userMap = new Map<string, string>()
  if (activeUserIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, activeUserIds))
    for (const u of userRows) userMap.set(u.id, u.fullName ?? u.id)
  }

  const timeMap = new Map<number, number>()
  for (const r of timeRows) timeMap.set(r.ticketId, r.totalSeconds)

  const yesterdayMap = new Map<number, number>()
  for (const r of yesterdayRows) yesterdayMap.set(r.ticketId, r.totalSeconds)

  const activeMap = new Map<number, { user_name: string; start_time: string }[]>()
  for (const r of activeRows) {
    const arr = activeMap.get(r.ticketId) ?? []
    arr.push({ user_name: userMap.get(r.userId) ?? r.userId, start_time: r.startTime.toISOString() })
    activeMap.set(r.ticketId, arr)
  }

  const result: TicketTrackerStat[] = ticketIds.map((id) => ({
    ticket_id: id,
    today_seconds: timeMap.get(id) ?? 0,
    yesterday_seconds: yesterdayMap.get(id) ?? 0,
    active_trackers: activeMap.get(id) ?? [],
  }))

  return NextResponse.json(result)
}
