import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, db, tickets, ticketTimeTracker, users } from '@/lib/db'


export type CompanyTimeStat = {
  company_id: string
  today_seconds: number
  active_time_hours: number
  active_manager_name: string | null
  has_active_tracker: boolean
  active_tracker_user_name: string | null
  active_tracker_start_time: string | null
}

/** GET /api/tickets/company-time-stats?company_ids=id1,id2,... */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('company_ids') ?? ''
  const companyIds = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (companyIds.length === 0) {
    return NextResponse.json([])
  }

  // Start of today in UTC (UTC midnight = 07:00 WIB, which naturally covers overnight shifts ending before 07:00 WIB)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // Total time logged today per company — join ticket_time_tracker → tickets on company_id
  const timeRows = await db
    .select({
      companyId: tickets.companyId,
      totalSeconds: sql<number>`coalesce(sum(
        case
          when ${ticketTimeTracker.durationAdjustment} is not null then ${ticketTimeTracker.durationAdjustment}
          when ${ticketTimeTracker.durationSeconds} is not null then ${ticketTimeTracker.durationSeconds}
          else 0
        end
      ), 0)`.mapWith(Number),
    })
    .from(ticketTimeTracker)
    .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .where(
      and(
        isNotNull(tickets.companyId),
        inArray(tickets.companyId, companyIds),
        gte(ticketTimeTracker.startTime, todayStart),
        isNotNull(ticketTimeTracker.stopTime),
      )
    )
    .groupBy(tickets.companyId)

  // Active trackers (stopTime IS NULL) — get the earliest running session per company with user info
  const activeRows = await db
    .select({
      companyId: tickets.companyId,
      userId: ticketTimeTracker.userId,
      startTime: ticketTimeTracker.startTime,
    })
    .from(ticketTimeTracker)
    .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .where(
      and(
        isNotNull(tickets.companyId),
        inArray(tickets.companyId, companyIds),
        isNull(ticketTimeTracker.stopTime),
      )
    )

  // Resolve active tracker user names
  const activeUserIds = [...new Set(activeRows.map(r => r.userId).filter(Boolean))]
  const activeUserMap = new Map<string, string>()
  if (activeUserIds.length > 0) {
    const activeUserRows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, activeUserIds))
    for (const u of activeUserRows) activeUserMap.set(u.id, u.fullName ?? u.id)
  }

  // Keep earliest startTime per company (longest running session)
  const activeMap = new Map<string, { userId: string; startTime: Date }>()
  for (const r of activeRows) {
    if (!r.companyId) continue
    const existing = activeMap.get(r.companyId)
    if (!existing || r.startTime < existing.startTime) {
      activeMap.set(r.companyId, { userId: r.userId, startTime: r.startTime })
    }
  }

  // Company active_time + active_manager_id
  const companyRows = await db
    .select({
      id: companies.id,
      activeTime: companies.activeTime,
      activeManagerId: companies.activeManagerId,
    })
    .from(companies)
    .where(inArray(companies.id, companyIds))

  // Collect manager ids to resolve names
  const managerIds = companyRows
    .map((c) => c.activeManagerId)
    .filter((id): id is string => id != null)

  const managerMap = new Map<string, string>()
  if (managerIds.length > 0) {
    const managerRows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, managerIds))
    for (const m of managerRows) {
      managerMap.set(m.id, m.fullName ?? m.id)
    }
  }

  const timeMap = new Map<string, number>()
  for (const r of timeRows) {
    if (r.companyId) timeMap.set(r.companyId, r.totalSeconds)
  }

  const result: CompanyTimeStat[] = companyRows.map((c) => {
    const active = activeMap.get(c.id) ?? null
    return {
      company_id: c.id,
      today_seconds: timeMap.get(c.id) ?? 0,
      active_time_hours: c.activeTime ?? 0,
      active_manager_name: c.activeManagerId ? (managerMap.get(c.activeManagerId) ?? null) : null,
      has_active_tracker: !!active,
      active_tracker_user_name: active ? (activeUserMap.get(active.userId) ?? null) : null,
      active_tracker_start_time: active ? active.startTime.toISOString() : null,
    }
  })

  return NextResponse.json(result)
}
