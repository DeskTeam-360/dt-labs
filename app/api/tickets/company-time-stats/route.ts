import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, db, tickets, ticketTimeTracker, users } from '@/lib/db'


export type CompanyTimeStat = {
  company_id: string
  today_seconds: number
  active_time_hours: number
  active_manager_name: string | null
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

  // Start of today in UTC
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

  const result: CompanyTimeStat[] = companyRows.map((c) => ({
    company_id: c.id,
    today_seconds: timeMap.get(c.id) ?? 0,
    active_time_hours: c.activeTime ?? 0,
    active_manager_name: c.activeManagerId ? (managerMap.get(c.activeManagerId) ?? null) : null,
  }))

  return NextResponse.json(result)
}
