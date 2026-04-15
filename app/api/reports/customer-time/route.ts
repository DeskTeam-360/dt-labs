import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { companies, db, ticketPriorities,tickets, ticketTimeTracker } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

function parseCompanyIds(param: string | null): string[] {
  if (!param?.trim()) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of param.split(',')) {
    const id = part.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Ticket filters shared by candidate list + session joins. */
function ticketFilterParts(
  companyIds: string[],
  statusSlugs: string[] | null,
  urgentOnly: boolean,
  urgentPriorityId: number | null
) {
  const parts = [inArray(tickets.companyId, companyIds), eq(tickets.ticketType, 'support')]
  if (statusSlugs && statusSlugs.length > 0) {
    parts.push(inArray(tickets.status, statusSlugs))
  }
  if (urgentOnly) {
    if (urgentPriorityId == null) return null
    parts.push(eq(tickets.priorityId, urgentPriorityId))
  }
  return parts
}

/** Session intervals overlap [startDate, endDate] (inclusive bounds; open end = no upper/lower filter). */
function sessionOverlapsWindowParts(startDate: Date | null, endDate: Date | null) {
  const parts = []
  if (endDate != null) {
    parts.push(lte(ticketTimeTracker.startTime, endDate))
  }
  if (startDate != null) {
    // pg driver rejects JS Date inside sql`` fragments — bind ISO string
    parts.push(sql`coalesce(${ticketTimeTracker.stopTime}, now()) >= ${startDate.toISOString()}`)
  }
  return parts
}

/**
 * GET /api/reports/customer-time?company_id=uuid1,uuid2&start=&end=&status=&urgent_only=1
 *
 * **With a date range**, a ticket is included only if:
 * - its **created_at** falls in [start, end], or
 * - it has **time-tracker activity overlapping** that window (any session where
 *   `start_time <= end` and `coalesce(stop_time, now()) >= start`, including running timers).
 *
 * Without start/end, all tickets matching company / status / urgent filters are listed.
 *
 * Tickets with no completed time in the window still appear (reported_seconds may be 0).
 * **Reported seconds** sum **completed** sessions (`stop_time` set) that overlap the same window
 * (full session duration is counted, not prorated).
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const companyIds = parseCompanyIds(url.searchParams.get('company_id'))
  const startParam = url.searchParams.get('start')
  const endParam = url.searchParams.get('end')
  const statusParam = url.searchParams.get('status')?.trim()
  const urgentOnly = url.searchParams.get('urgent_only') === '1'

  if (companyIds.length === 0) {
    return NextResponse.json({ error: 'company_id required (one or more UUIDs, comma-separated)' }, { status: 400 })
  }

  const companyRows = await db.select().from(companies).where(inArray(companies.id, companyIds))
  if (companyRows.length !== companyIds.length) {
    return NextResponse.json({ error: 'One or more companies not found' }, { status: 404 })
  }

  const companyById = new Map(companyRows.map((c) => [c.id, c]))
  const companiesPayload = companyIds
    .map((id) => {
      const row = companyById.get(id)
      return row ? { id: row.id, name: row.name } : null
    })
    .filter(Boolean) as { id: string; name: string | null }[]

  const priorityRows = await db.select().from(ticketPriorities)
  const priorityById = new Map<number, { title: string | null; slug: string | null }>()
  for (const p of priorityRows) {
    priorityById.set(p.id, { title: p.title, slug: p.slug })
  }
  const urgentPrio = priorityRows.find(
    (p) =>
      (p.slug ?? '').toLowerCase().trim() === 'urgent' ||
      (p.title ?? '').toLowerCase().trim() === 'urgent'
  )
  const urgentPriorityId = urgentPrio?.id ?? null

  const statusSlugs = statusParam
    ? statusParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : null

  const startDate = startParam ? new Date(startParam) : null
  const endDate = endParam ? new Date(endParam) : null
  if (startDate && Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'Invalid start' }, { status: 400 })
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid end' }, { status: 400 })
  }

  const emptyResponse = () =>
    NextResponse.json({
      companies: companiesPayload,
      filters: {
        start: startParam,
        end: endParam,
        status: statusSlugs,
        urgent_only: urgentOnly,
        company_ids: companyIds,
      },
      summary: {
        ticket_count: 0,
        completed_ticket_count: 0,
        urgent_ticket_count: 0,
        total_reported_seconds: 0,
        session_count: 0,
        untouched_ticket_count: 0,
      },
      tickets: [],
    })

  const baseParts = ticketFilterParts(companyIds, statusSlugs, urgentOnly, urgentPriorityId)
  if (baseParts === null) {
    return emptyResponse()
  }

  const candidateRows = await db.select().from(tickets).where(and(...baseParts))

  const hasDateWindow = startDate != null || endDate != null

  let includedRows = candidateRows
  if (hasDateWindow) {
    const createdConds = [...baseParts]
    if (startDate) createdConds.push(gte(tickets.createdAt, startDate))
    if (endDate) createdConds.push(lte(tickets.createdAt, endDate))
    const createdInWindow = await db.select({ id: tickets.id }).from(tickets).where(and(...createdConds))
    const createdIds = new Set(createdInWindow.map((r) => r.id))

    const workedRows = await db
      .select({ id: tickets.id })
      .from(ticketTimeTracker)
      .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
      .where(and(...baseParts, ...sessionOverlapsWindowParts(startDate, endDate)))

    const workedIds = new Set(workedRows.map((r) => r.id))
    includedRows = candidateRows.filter((t) => createdIds.has(t.id) || workedIds.has(t.id))
  }

  const includedIds = includedRows.map((t) => t.id)
  if (includedIds.length === 0) {
    return NextResponse.json({
      companies: companiesPayload,
      filters: {
        start: startParam,
        end: endParam,
        status: statusSlugs,
        urgent_only: urgentOnly,
        company_ids: companyIds,
      },
      summary: {
        ticket_count: 0,
        completed_ticket_count: 0,
        urgent_ticket_count: 0,
        total_reported_seconds: 0,
        session_count: 0,
        untouched_ticket_count: 0,
      },
      tickets: [],
    })
  }

  const aggConds = [isNotNull(ticketTimeTracker.stopTime), inArray(ticketTimeTracker.ticketId, includedIds)]
  if (hasDateWindow) {
    aggConds.push(...sessionOverlapsWindowParts(startDate, endDate))
  }

  const rows = await db
    .select({
      tracker: ticketTimeTracker,
      ticket: tickets,
    })
    .from(ticketTimeTracker)
    .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .where(and(...aggConds))

  const secondsByTicket = new Map<number, number>()
  let totalReported = 0
  for (const r of rows) {
    const sec = reportedDurationSeconds({
      durationSeconds: r.tracker.durationSeconds,
      durationAdjustment: r.tracker.durationAdjustment,
    })
    totalReported += sec
    const tid = r.ticket.id
    secondsByTicket.set(tid, (secondsByTicket.get(tid) ?? 0) + sec)
  }

  const ticketMeta = new Map<
    number,
    {
      status: string
      priorityId: number | null
      title: string
      companyId: string | null
      companyName: string | null
      createdAt: Date | null
    }
  >()

  for (const t of includedRows) {
    const cid = t.companyId
    const ca = t.createdAt
    ticketMeta.set(t.id, {
      status: t.status,
      priorityId: t.priorityId,
      title: t.title,
      companyId: cid,
      companyName: cid ? companyById.get(cid)?.name ?? null : null,
      createdAt: ca instanceof Date ? ca : ca ? new Date(ca) : null,
    })
  }

  let completedTicketCount = 0
  let urgentTicketCount = 0
  let untouchedTicketCount = 0
  for (const [, v] of ticketMeta) {
    const st = (v.status ?? '').toLowerCase()
    if (st === 'completed' || st === 'resolved' || st === 'closed') completedTicketCount++
    if (urgentPriorityId != null && v.priorityId === urgentPriorityId) urgentTicketCount++
  }
  for (const id of ticketMeta.keys()) {
    if ((secondsByTicket.get(id) ?? 0) === 0) untouchedTicketCount++
  }

  const ticketList = [...ticketMeta.entries()].map(([id, v]) => {
    const pr = v.priorityId != null ? priorityById.get(v.priorityId) : undefined
    const createdAtIso =
      v.createdAt && !Number.isNaN(v.createdAt.getTime()) ? v.createdAt.toISOString() : null
    return {
      id,
      title: v.title,
      status: v.status,
      company_id: v.companyId,
      company_name: v.companyName,
      reported_seconds: secondsByTicket.get(id) ?? 0,
      created_at: createdAtIso,
      priority_title: pr?.title ?? null,
      priority_slug: pr?.slug ?? null,
      is_urgent: urgentPriorityId != null && v.priorityId === urgentPriorityId,
      has_reported_time: (secondsByTicket.get(id) ?? 0) > 0,
    }
  })

  ticketList.sort((a, b) => {
    if (b.reported_seconds !== a.reported_seconds) return b.reported_seconds - a.reported_seconds
    return b.id - a.id
  })

  return NextResponse.json({
    companies: companiesPayload,
    filters: {
      start: startParam,
      end: endParam,
      status: statusSlugs,
      urgent_only: urgentOnly,
      company_ids: companyIds,
    },
    summary: {
      ticket_count: ticketMeta.size,
      completed_ticket_count: completedTicketCount,
      urgent_ticket_count: urgentTicketCount,
      total_reported_seconds: totalReported,
      session_count: rows.length,
      untouched_ticket_count: untouchedTicketCount,
    },
    tickets: ticketList.slice(0, 500),
  })
}
