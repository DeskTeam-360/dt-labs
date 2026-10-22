import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { companies, db, tickets, ticketTimeTracker } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

const WIB_MS = 7 * 60 * 60 * 1000

/**
 * GET /api/board/company-load
 * Admin only. All active companies (customers and internal) with the plan hours per day, the time spent today (WIB) and whether a timer is running
 * on any of their tickets right now. Feeds the company filter of the Team Pool.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()
  const wibNow = new Date(now.getTime() + WIB_MS)
  const dayStart = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()) - WIB_MS)

  const rows = await db
    .select()
    .from(companies)
    .where(eq(companies.isActive, true))
    .orderBy(asc(companies.name))
  if (rows.length === 0) return NextResponse.json({ companies: [] })
  const ids = rows.map((c) => c.id)

  const sessions = await db
    .select({
      companyId: tickets.companyId,
      startTime: ticketTimeTracker.startTime,
      stopTime: ticketTimeTracker.stopTime,
      durationSeconds: ticketTimeTracker.durationSeconds,
      durationAdjustment: ticketTimeTracker.durationAdjustment,
    })
    .from(ticketTimeTracker)
    .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .where(
      and(
        inArray(tickets.companyId, ids),
        eq(tickets.ticketType, 'support'),
        or(isNull(ticketTimeTracker.stopTime), sql`${ticketTimeTracker.startTime} >= ${dayStart.toISOString()}`)
      )
    )

  const spent = new Map<string, number>()
  const active = new Set<string>()
  for (const s of sessions) {
    if (!s.companyId) continue
    const start = s.startTime instanceof Date ? s.startTime : new Date(s.startTime)
    if (!s.stopTime) active.add(s.companyId)
    if (start < dayStart) continue
    const sec = s.stopTime
      ? reportedDurationSeconds({ durationSeconds: s.durationSeconds, durationAdjustment: s.durationAdjustment })
      : Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000))
    spent.set(s.companyId, (spent.get(s.companyId) ?? 0) + sec)
  }

  return NextResponse.json({
    companies: rows
      .map((c) => ({
        id: c.id,
        name: c.name,
        is_customer: c.isCustomer,
        display_order: c.displayOrder ?? null,
        plan_hours: c.activeTime ?? 0,
        spent_hours: Math.round(((spent.get(c.id) ?? 0) / 3600) * 10) / 10,
        has_active_timer: active.has(c.id),
      }))
      .sort((a, b) => (a.display_order ?? 1e9) - (b.display_order ?? 1e9) || a.name.localeCompare(b.name)),
  })
}
