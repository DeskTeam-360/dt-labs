import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { db, ticketTimeTracker, tickets, companies, ticketPriorities } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET /api/reports/customer-time?company_id=&start=&end=&status=slug1,slug2&urgent_only=1 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const companyId = url.searchParams.get('company_id')?.trim() || null
  const startParam = url.searchParams.get('start')
  const endParam = url.searchParams.get('end')
  const statusParam = url.searchParams.get('status')?.trim()
  const urgentOnly = url.searchParams.get('urgent_only') === '1'

  if (!companyId) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  }

  const [companyRow] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!companyRow) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const priorityRows = await db.select().from(ticketPriorities)
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

  const conds = [
    eq(tickets.companyId, companyId),
    eq(tickets.ticketType, 'support'),
    isNotNull(ticketTimeTracker.stopTime),
  ]
  if (statusSlugs && statusSlugs.length > 0) {
    conds.push(inArray(tickets.status, statusSlugs))
  }
  if (urgentOnly) {
    if (urgentPriorityId == null) {
      return NextResponse.json({
        company: { id: companyRow.id, name: companyRow.name },
        filters: {
          start: startParam,
          end: endParam,
          status: statusSlugs,
          urgent_only: true,
        },
        summary: {
          ticket_count: 0,
          completed_ticket_count: 0,
          urgent_ticket_count: 0,
          total_reported_seconds: 0,
          session_count: 0,
        },
        tickets: [],
      })
    }
    conds.push(eq(tickets.priorityId, urgentPriorityId))
  }
  if (startDate) {
    conds.push(gte(ticketTimeTracker.startTime, startDate))
  }
  if (endDate) {
    conds.push(lte(ticketTimeTracker.startTime, endDate))
  }

  const rows = await db
    .select({
      tracker: ticketTimeTracker,
      ticket: tickets,
    })
    .from(ticketTimeTracker)
    .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .where(and(...conds))

  const ticketMeta = new Map<number, { status: string; priorityId: number | null; title: string }>()
  let totalReported = 0
  for (const r of rows) {
    totalReported += reportedDurationSeconds({
      durationSeconds: r.tracker.durationSeconds,
      durationAdjustment: r.tracker.durationAdjustment,
    })
    const tid = r.ticket.id
    if (!ticketMeta.has(tid)) {
      ticketMeta.set(tid, {
        status: r.ticket.status,
        priorityId: r.ticket.priorityId,
        title: r.ticket.title,
      })
    }
  }

  let completedTicketCount = 0
  let urgentTicketCount = 0
  for (const [, v] of ticketMeta) {
    if ((v.status ?? '').toLowerCase() === 'completed') completedTicketCount++
    if (urgentPriorityId != null && v.priorityId === urgentPriorityId) urgentTicketCount++
  }

  const ticketList = [...ticketMeta.entries()].map(([id, v]) => ({
    id,
    title: v.title,
    status: v.status,
    is_completed: (v.status ?? '').toLowerCase() === 'completed',
    is_urgent: urgentPriorityId != null && v.priorityId === urgentPriorityId,
  }))

  return NextResponse.json({
    company: { id: companyRow.id, name: companyRow.name },
    filters: {
      start: startParam,
      end: endParam,
      status: statusSlugs,
      urgent_only: urgentOnly,
    },
    summary: {
      ticket_count: ticketMeta.size,
      completed_ticket_count: completedTicketCount,
      urgent_ticket_count: urgentTicketCount,
      total_reported_seconds: totalReported,
      session_count: rows.length,
    },
    tickets: ticketList.slice(0, 500),
  })
}
