import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { companies, db, tickets, ticketTimeTracker } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { getCapacityDaily, wibTodayYmd } from '@/lib/user-capacity'

const WIB_MS = 7 * 60 * 60 * 1000

/**
 * GET /api/board/people-status?user_ids=a,b   (admin only)
 * Per person, for today (WIB): leave / duty status from Team Availability, the hours they are expected to work,
 * the shift seen from today's tracked sessions (first start - last stop), time tracked today, and what they have
 * a running timer on right now.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userIds = (new URL(request.url).searchParams.get('user_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (userIds.length === 0) return NextResponse.json({ people: {} })

  const now = new Date()
  const today = wibTodayYmd()
  const wibNow = new Date(now.getTime() + WIB_MS)
  const dayStart = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()) - WIB_MS)

  const [capacity, sessions] = await Promise.all([
    getCapacityDaily(userIds, today, today),
    db
      .select({
        userId: ticketTimeTracker.userId,
        ticketId: ticketTimeTracker.ticketId,
        startTime: ticketTimeTracker.startTime,
        stopTime: ticketTimeTracker.stopTime,
        durationSeconds: ticketTimeTracker.durationSeconds,
        durationAdjustment: ticketTimeTracker.durationAdjustment,
        title: tickets.title,
        companyName: companies.name,
      })
      .from(ticketTimeTracker)
      .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(
        and(
          inArray(ticketTimeTracker.userId, userIds),
          or(isNull(ticketTimeTracker.stopTime), sql`${ticketTimeTracker.startTime} >= ${dayStart.toISOString()}`)
        )
      ),
  ])

  type Active = { ticket_id: number; title: string; company: string | null; since: string }
  const people: Record<
    string,
    {
      reason: string | null
      capacity_hours: number | null
      shift_start: string | null
      shift_end: string | null
      tracked_seconds: number
      active: Active[]
    }
  > = {}

  for (const id of userIds) {
    const cap = capacity.get(id)?.get(today)
    people[id] = {
      reason: cap?.reason ?? null,
      capacity_hours: cap ? cap.hours : null,
      shift_start: null,
      shift_end: null,
      tracked_seconds: 0,
      active: [],
    }
  }

  for (const s of sessions) {
    const p = people[s.userId]
    if (!p) continue
    const start = s.startTime instanceof Date ? s.startTime : new Date(s.startTime)
    if (!s.stopTime) {
      p.active.push({ ticket_id: s.ticketId, title: s.title, company: s.companyName ?? null, since: start.toISOString() })
    }
    if (start < dayStart) continue
    const end = s.stopTime ? (s.stopTime instanceof Date ? s.stopTime : new Date(s.stopTime)) : now
    if (!p.shift_start || start.toISOString() < p.shift_start) p.shift_start = start.toISOString()
    if (!p.shift_end || end.toISOString() > p.shift_end) p.shift_end = end.toISOString()
    p.tracked_seconds += s.stopTime
      ? reportedDurationSeconds({ durationSeconds: s.durationSeconds, durationAdjustment: s.durationAdjustment })
      : Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000))
  }

  return NextResponse.json({ people })
}
