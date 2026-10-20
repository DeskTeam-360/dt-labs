import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canViewCustomerReports, isAdminOrManager } from '@/lib/auth-utils'
import { companies, db, jobTypes, teamMembers, teams, tickets, ticketTimeTracker, users } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { getCapacityDaily, isValidYmd, listYmd, wibTodayYmd } from '@/lib/user-capacity'

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_DAYS = 93
/** Days with at least this many unused hours are flagged as "loose". */
const LOOSE_DAY_MIN_FREE_HOURS = 2

function wibDayStartMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d) - WIB_OFFSET_MS
}

const round2 = (n: number) => Math.round(n * 100) / 100
const hours = (sec: number) => round2(sec / 3600)

function normJob(x: string | null | undefined) {
  return (x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

type Acc = {
  /** seconds worked per WIB day, all tickets */
  dayAll: Map<string, number>
  /** seconds worked per WIB day, within the selected scope (customer-only or all) */
  dayScope: Map<string, number>
  /** seconds per company key within scope */
  byCompany: Map<string, { name: string; isCustomer: boolean; order: number | null; seconds: number }>
  totalAll: number
  totalScope: number
  extraTime: number
  /** company key → ticket id → seconds (within scope) */
  byTicket: Map<string, Map<number, { title: string; seconds: number }>>
}

/**
 * GET /api/reports/team-utilization?team_ids=a,b&start=YYYY-MM-DD&end=YYYY-MM-DD&customer_only=1
 * Per person: capacity (leave / piket / holidays aware), time worked, utilization, per-company split and
 * day-by-day free time. Dates are WIB calendar days. Admin & manager.
 *
 * `mine=1` returns only the signed-in user (no team_ids needed); allowed for admin, manager and staff.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(request.url).searchParams
  const mine = q.get('mine') === '1'
  const sessionRole = (session.user as { role?: string }).role
  if (mine ? !canViewCustomerReports(sessionRole) : !isAdminOrManager(sessionRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const teamIds = [...new Set((q.get('team_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
  const start = q.get('start')
  const end = q.get('end')
  const customerOnly = q.get('customer_only') === '1'
  if (!mine && teamIds.length === 0) return NextResponse.json({ error: 'team_ids is required' }, { status: 400 })
  if (!isValidYmd(start) || !isValidYmd(end) || end < start) {
    return NextResponse.json({ error: 'start and end (YYYY-MM-DD) are required' }, { status: 400 })
  }
  // Future days have no work yet; counting their capacity would make everyone look idle.
  const todayWib = wibTodayYmd()
  const effEnd = end > todayWib ? todayWib : end
  if (effEnd < start) {
    return NextResponse.json({ start, end, customer_only: customerOnly, summary: null, people: [], future_range: true })
  }
  const days = listYmd(start, effEnd)
  if (days.length > MAX_DAYS) {
    return NextResponse.json({ error: `Date range too large (max ${MAX_DAYS} days)` }, { status: 400 })
  }
  const windowStart = wibDayStartMs(start)
  const windowEnd = wibDayStartMs(effEnd) + DAY_MS

  // --- people
  const [memberRows, teamRows]: [{ teamId: string; userId: string }[], { id: string; name: string }[]] = mine
    ? [[{ teamId: '', userId: session.user.id }], []]
    : await Promise.all([
        db
          .select({ teamId: teamMembers.teamId, userId: teamMembers.userId })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, teamIds)),
        db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds)),
      ])
  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]))
  const userIds = [...new Set(memberRows.map((m) => m.userId))]
  if (userIds.length === 0) {
    return NextResponse.json({ start, end, customer_only: customerOnly, summary: null, people: [] })
  }
  const userRows = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, position: users.position, role: users.role })
    .from(users)
    .where(and(inArray(users.id, userIds), sql`${users.deletedAt} is null`))
  const teamsByUser = new Map<string, string[]>()
  for (const m of memberRows) {
    const arr = teamsByUser.get(m.userId) ?? []
    const nm = teamNameById.get(m.teamId)
    if (nm && !arr.includes(nm)) arr.push(nm)
    teamsByUser.set(m.userId, arr)
  }
  const activeIds = userRows.map((u) => u.id)

  // --- work sessions overlapping the window
  const nowMs = Date.now()
  const [capacity, sessionRows, jobRows] = await Promise.all([
    getCapacityDaily(activeIds, start, effEnd),
    db
      .select({
        userId: ticketTimeTracker.userId,
        startTime: ticketTimeTracker.startTime,
        stopTime: ticketTimeTracker.stopTime,
        durationSeconds: ticketTimeTracker.durationSeconds,
        durationAdjustment: ticketTimeTracker.durationAdjustment,
        jobType: ticketTimeTracker.jobType,
        companyId: tickets.companyId,
        companyName: companies.name,
        companyIsCustomer: companies.isCustomer,
        companyOrder: companies.displayOrder,
        ticketId: tickets.id,
        ticketTitle: tickets.title,
      })
      .from(ticketTimeTracker)
      .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(
        and(
          inArray(ticketTimeTracker.userId, activeIds),
          lt(ticketTimeTracker.startTime, new Date(windowEnd)),
          sql`coalesce(${ticketTimeTracker.stopTime}, now()) > ${new Date(windowStart).toISOString()}`
        )
      ),
    db.select({ slug: jobTypes.slug, title: jobTypes.title }).from(jobTypes),
  ])
  const jobTitle = new Map(jobRows.map((j) => [j.slug, j.title]))

  const acc = new Map<string, Acc>()
  const getAcc = (uid: string): Acc => {
    let a = acc.get(uid)
    if (!a) {
      a = { dayAll: new Map(), dayScope: new Map(), byCompany: new Map(), totalAll: 0, totalScope: 0, extraTime: 0, byTicket: new Map() }
      acc.set(uid, a)
    }
    return a
  }

  for (const r of sessionRows) {
    const s = new Date(r.startTime).getTime()
    const e = r.stopTime ? new Date(r.stopTime).getTime() : nowMs
    if (!(e > s)) continue
    const wallSec = (e - s) / 1000
    const repSec = r.stopTime
      ? reportedDurationSeconds({ durationSeconds: r.durationSeconds, durationAdjustment: r.durationAdjustment })
      : wallSec
    const isCustomerCompany = Boolean(r.companyIsCustomer)
    const inScope = !customerOnly || isCustomerCompany
    const key = r.companyId ?? 'none'
    const a = getAcc(r.userId)
    const firstIdx = Math.max(0, Math.floor((Math.max(s, windowStart) - windowStart) / DAY_MS))
    const lastIdx = Math.min(days.length - 1, Math.floor((Math.min(e, windowEnd) - 1 - windowStart) / DAY_MS))
    for (let i = firstIdx; i <= lastIdx; i++) {
      const dayStart = windowStart + i * DAY_MS
      const ov = Math.max(0, Math.min(e, dayStart + DAY_MS) - Math.max(s, dayStart)) / 1000
      if (ov <= 0) continue
      const share = repSec * (ov / wallSec)
      const d = days[i]
      a.totalAll += share
      a.dayAll.set(d, (a.dayAll.get(d) ?? 0) + share)
      if (r.jobType === 'extra_time') {
        a.extraTime += share
      }
      if (inScope) {
        a.totalScope += share
        a.dayScope.set(d, (a.dayScope.get(d) ?? 0) + share)
        const cur = a.byCompany.get(key) ?? {
          name: r.companyId ? r.companyName ?? 'Unnamed company' : 'No company',
          isCustomer: isCustomerCompany,
          order: r.companyOrder ?? null,
          seconds: 0,
        }
        cur.seconds += share
        a.byCompany.set(key, cur)
        let tm = a.byTicket.get(key)
        if (!tm) {
          tm = new Map()
          a.byTicket.set(key, tm)
        }
        const tk = tm.get(r.ticketId) ?? { title: r.ticketTitle ?? '', seconds: 0 }
        tk.seconds += share
        tm.set(r.ticketId, tk)
      }
    }
  }

  // --- per person
  const people = userRows
    .map((u) => {
      const a = acc.get(u.id) ?? getAcc(u.id)
      const cap = capacity.get(u.id) ?? new Map<string, { hours: number; reason: string }>()
      let capacityHours = 0
      let freeHours = 0
      let overtimeHours = 0
      let offDayWorkHours = 0
      let idleDays = 0
      let looseDays = 0
      const dayRows = days.map((d) => {
        const c = cap.get(d)
        const capH = c?.hours ?? 0
        const workedScopeH = (a.dayScope.get(d) ?? 0) / 3600
        const workedAllH = (a.dayAll.get(d) ?? 0) / 3600
        capacityHours += capH
        const free = Math.max(0, capH - workedScopeH)
        freeHours += capH > 0 ? free : 0
        if (capH > 0 && workedAllH > capH) overtimeHours += workedAllH - capH
        if (capH === 0) offDayWorkHours += workedAllH
        if (capH > 0 && workedAllH < 0.05) idleDays++
        if (capH > 0 && free >= LOOSE_DAY_MIN_FREE_HOURS) looseDays++
        return {
          date: d,
          reason: c?.reason ?? 'not_employed',
          capacity_hours: round2(capH),
          worked_hours: round2(workedScopeH),
          free_hours: round2(capH > 0 ? free : 0),
        }
      })
      const workedScopeH = a.totalScope / 3600
      const companiesOut = [...a.byCompany.entries()]
        .map(([id, v]) => ({
          company_id: id === 'none' ? null : id,
          name: v.name,
          is_customer: v.isCustomer,
          hours: round2(v.seconds / 3600),
          pct_of_capacity: capacityHours > 0 ? round2((v.seconds / 3600 / capacityHours) * 100) : null,
          pct_of_worked: a.totalScope > 0 ? round2((v.seconds / a.totalScope) * 100) : null,
          top_tickets: [...(a.byTicket.get(id)?.entries() ?? [])]
            .map(([ticketId, t]) => ({
              ticket_id: ticketId,
              title: t.title,
              hours: round2(t.seconds / 3600),
              pct_of_company: v.seconds > 0 ? round2((t.seconds / v.seconds) * 100) : null,
            }))
            .sort((x, y) => y.hours - x.hours)
            .slice(0, 5),
          display_order: v.order,
        }))
        .sort((x, y) => y.hours - x.hours)
      // Biggest company by hours (used for "top company") before the manual display order is applied.
      const topCompanySharePct = companiesOut[0]?.pct_of_worked ?? null
      companiesOut.sort(
        (x, y) =>
          (x.display_order ?? Number.MAX_SAFE_INTEGER) - (y.display_order ?? Number.MAX_SAFE_INTEGER) ||
          y.hours - x.hours
      )
      return {
        user_id: u.id,
        name: u.fullName || u.email,
        position: u.position,
        teams: teamsByUser.get(u.id) ?? [],
        capacity_hours: round2(capacityHours),
        worked_hours: round2(workedScopeH),
        worked_hours_all: hours(a.totalAll),
        non_customer_hours: round2(
          (customerOnly
            ? a.totalAll - a.totalScope
            : [...a.byCompany.values()].filter((v) => !v.isCustomer).reduce((sum, v) => sum + v.seconds, 0)) / 3600
        ),
        utilization_pct: capacityHours > 0 ? round2((workedScopeH / capacityHours) * 100) : null,
        free_hours: round2(freeHours),
        overtime_hours: round2(overtimeHours),
        off_day_work_hours: round2(offDayWorkHours),
        idle_days: idleDays,
        loose_days: looseDays,
        extra_time_hours: hours(a.extraTime),
        top_company_share_pct: topCompanySharePct,
        companies: companiesOut,
        days: dayRows,
      }
    })
    .sort((a, b) => (b.utilization_pct ?? -1) - (a.utilization_pct ?? -1))

  const totalCap = people.reduce((s, p) => s + p.capacity_hours, 0)
  const totalWorked = people.reduce((s, p) => s + p.worked_hours, 0)
  return NextResponse.json({
    start,
    end: effEnd,
    clipped_to_today: effEnd !== end,
    customer_only: customerOnly,
    loose_day_min_free_hours: LOOSE_DAY_MIN_FREE_HOURS,
    summary: {
      people: people.length,
      capacity_hours: round2(totalCap),
      worked_hours: round2(totalWorked),
      utilization_pct: totalCap > 0 ? round2((totalWorked / totalCap) * 100) : null,
      free_hours: round2(people.reduce((s, p) => s + p.free_hours, 0)),
      overtime_hours: round2(people.reduce((s, p) => s + p.overtime_hours, 0)),
      under_50: people.filter((p) => p.utilization_pct != null && p.utilization_pct < 50).length,
      over_100: people.filter((p) => p.utilization_pct != null && p.utilization_pct > 100).length,
    },
    people,
  })
}
