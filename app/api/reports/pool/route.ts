import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canViewCustomerReports } from '@/lib/auth-utils'
import { companies, db, ticketAssignees, tickets, ticketTimeTracker, users } from '@/lib/db'
import { getLastActivity } from '@/lib/ticket-last-activity'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

/** Only tickets still waiting for or in work are listed in the pool. */
const POOL_STATUSES = ['open', 'received', 'working_team']
const WIB_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Start of the current WIB day and of the current WIB week (Monday), as UTC instants. */
function wibBounds(now = new Date()) {
  const wibNow = new Date(now.getTime() + WIB_MS)
  const dayStartWib = Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate())
  const dow = new Date(dayStartWib).getUTCDay() // 0 = Sunday
  const sinceMonday = (dow + 6) % 7
  return {
    day: new Date(dayStartWib - WIB_MS),
    week: new Date(dayStartWib - sinceMonday * DAY_MS - WIB_MS),
  }
}

/**
 * GET /api/reports/pool?company_id=a,b&search=52387&sort=customer|weekly|daily
 *
 * Pool of customers with the tickets that still need work (open / received / working_team) and how much
 * time was spent today and this week (WIB). Without company_id every customer company is listed.
 * With `search` (ticket number, "#" optional) only the owning company is returned, with the searched ticket
 * flagged `highlight` (shown even if its status is outside the pool statuses).
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canViewCustomerReports((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const companyParam = (url.searchParams.get('company_id') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const sort = url.searchParams.get('sort') ?? 'customer'
  // Customer priority reads 1 → N by default; spend sorts start with the biggest.
  const order = url.searchParams.get('order') === 'asc' ? 'asc' : url.searchParams.get('order') === 'desc' ? 'desc' : sort === 'customer' ? 'asc' : 'desc'
  const searchDigits = (url.searchParams.get('search') ?? '').replace(/\D/g, '')
  const searchId = searchDigits ? Number(searchDigits) : null
  const now = new Date()
  const { day, week } = wibBounds(now)

  let companyIds = companyParam
  let highlightId: number | null = null
  if (searchId != null && Number.isSafeInteger(searchId) && searchId <= 2147483647) {
    const [hit] = await db
      .select({ id: tickets.id, companyId: tickets.companyId })
      .from(tickets)
      .where(eq(tickets.id, searchId))
      .limit(1)
    if (!hit || !hit.companyId) {
      return NextResponse.json({ generated_at: now.toISOString(), search_found: false, companies: [] })
    }
    highlightId = hit.id
    companyIds = [hit.companyId]
  }

  const companyRows = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.isCustomer, true),
        eq(companies.isActive, true),
        companyIds.length ? inArray(companies.id, companyIds) : undefined
      )
    )
  if (companyRows.length === 0) {
    return NextResponse.json({ generated_at: now.toISOString(), search_found: highlightId != null, companies: [] })
  }
  const ids = companyRows.map((c) => c.id)

  const poolCond = and(
    inArray(tickets.companyId, ids),
    eq(tickets.ticketType, 'support'),
    highlightId != null
      ? or(inArray(tickets.status, POOL_STATUSES), eq(tickets.id, highlightId))
      : inArray(tickets.status, POOL_STATUSES)
  )
  const ticketRows = await db.select().from(tickets).where(poolCond)
  const ticketIds = ticketRows.map((t) => t.id)

  // Time this week (covers today too) for every support ticket of these companies, plus running timers.
  const sessions = await db
    .select({
      ticketId: ticketTimeTracker.ticketId,
      userId: ticketTimeTracker.userId,
      startTime: ticketTimeTracker.startTime,
      stopTime: ticketTimeTracker.stopTime,
      durationSeconds: ticketTimeTracker.durationSeconds,
      durationAdjustment: ticketTimeTracker.durationAdjustment,
      companyId: tickets.companyId,
    })
    .from(ticketTimeTracker)
    .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .where(
      and(
        inArray(tickets.companyId, ids),
        eq(tickets.ticketType, 'support'),
        or(isNull(ticketTimeTracker.stopTime), sql`${ticketTimeTracker.startTime} >= ${week.toISOString()}`)
      )
    )

  const dailyByCompany = new Map<string, number>()
  const weeklyByCompany = new Map<string, number>()
  const todayByTicket = new Map<number, number>()
  const running = new Map<number, { userId: string; since: Date }[]>()
  for (const s of sessions) {
    const start = s.startTime instanceof Date ? s.startTime : new Date(s.startTime)
    if (!s.stopTime) {
      const arr = running.get(s.ticketId) ?? []
      arr.push({ userId: s.userId, since: start })
      running.set(s.ticketId, arr)
    }
    if (start < week) continue
    const sec = s.stopTime
      ? reportedDurationSeconds({ durationSeconds: s.durationSeconds, durationAdjustment: s.durationAdjustment })
      : Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000))
    if (s.companyId) weeklyByCompany.set(s.companyId, (weeklyByCompany.get(s.companyId) ?? 0) + sec)
    if (start >= day) {
      if (s.companyId) dailyByCompany.set(s.companyId, (dailyByCompany.get(s.companyId) ?? 0) + sec)
      todayByTicket.set(s.ticketId, (todayByTicket.get(s.ticketId) ?? 0) + sec)
    }
  }

  const assigneeRows = ticketIds.length
    ? await db.select({ ticketId: ticketAssignees.ticketId, userId: ticketAssignees.userId }).from(ticketAssignees).where(inArray(ticketAssignees.ticketId, ticketIds))
    : []
  const userIds = [...new Set([...assigneeRows.map((a) => a.userId), ...[...running.values()].flat().map((r) => r.userId)])]
  const userRows = userIds.length
    ? await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(inArray(users.id, userIds))
    : []
  const nameOf = new Map(userRows.map((u) => [u.id, u.fullName || u.email]))
  const assigneesByTicket = new Map<number, string[]>()
  for (const a of assigneeRows) {
    const arr = assigneesByTicket.get(a.ticketId) ?? []
    arr.push(nameOf.get(a.userId) ?? 'Unknown')
    assigneesByTicket.set(a.ticketId, arr)
  }

  const lastActivity = await getLastActivity(ticketRows.map((t) => ({ id: t.id, createdAt: t.createdAt })))

  const out = companyRows.map((c) => {
    const plan = c.activeTime ?? 0
    const dailySeconds = dailyByCompany.get(c.id) ?? 0
    const weeklySeconds = weeklyByCompany.get(c.id) ?? 0
    const pct = (sec: number, hours: number) => (hours > 0 ? Math.round((sec / 3600 / hours) * 1000) / 10 : null)
    const activeUsers = [
      ...new Set(
        ticketRows
          .filter((t) => t.companyId === c.id)
          .flatMap((t) => (running.get(t.id) ?? []).map((r) => nameOf.get(r.userId) ?? 'Unknown'))
      ),
    ]
    const list = ticketRows
      .filter((t) => t.companyId === c.id)
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority ?? null,
        assignees: assigneesByTicket.get(t.id) ?? [],
        updated_at: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt ? new Date(t.updatedAt).toISOString() : null,
        last_activity_at: lastActivity.get(t.id) ?? null,
        today_seconds: todayByTicket.get(t.id) ?? 0,
        running: (running.get(t.id) ?? []).map((r) => ({
          user: nameOf.get(r.userId) ?? 'Unknown',
          seconds: Math.max(0, Math.floor((now.getTime() - r.since.getTime()) / 1000)),
        })),
        highlight: highlightId === t.id,
      }))
      .sort((a, b) => (a.priority ?? 1e9) - (b.priority ?? 1e9) || a.id - b.id)
    return {
      company_id: c.id,
      name: c.name,
      display_order: c.displayOrder ?? null,
      plan_hours: plan,
      active_users: activeUsers,
      daily_seconds: dailySeconds,
      daily_pct: pct(dailySeconds, plan),
      weekly_seconds: weeklySeconds,
      // A working week is 5 days of plan hours.
      weekly_pct: pct(weeklySeconds, plan * 5),
      tickets: list,
    }
  })

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
  const dir = order === 'asc' ? 1 : -1
  out.sort((a, b) => {
    if (sort === 'weekly') return dir * ((a.weekly_pct ?? -1) - (b.weekly_pct ?? -1)) || byName(a, b)
    if (sort === 'daily') return dir * ((a.daily_pct ?? -1) - (b.daily_pct ?? -1)) || byName(a, b)
    return dir * ((a.display_order ?? 1e9) - (b.display_order ?? 1e9)) || byName(a, b)
  })

  return NextResponse.json({ generated_at: now.toISOString(), search_found: highlightId != null, companies: out })
}
