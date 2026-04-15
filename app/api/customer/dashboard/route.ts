import { and,asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  companies,
  companyUsers,
  tags,
  ticketAssignees,
  ticketPriorities,
  tickets,
  ticketStatuses,
  ticketTags,
  ticketTimeTracker,
  ticketTypes,
  users,
} from '@/lib/db'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'

/** GET /api/customer/dashboard - Stats for customer dashboard. Add ?debug=1 to see why Urgent ETA might be missing. */
export async function GET(request: Request) {
  const session = await auth()
  const { searchParams } = new URL(request.url)
  const debug = searchParams.get('debug') === '1'
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Resolve company
  const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
  let companyId: string | null = userRow?.companyId ?? null
  if (!companyId) {
    const [cu] = await db.select({ companyId: companyUsers.companyId }).from(companyUsers).where(eq(companyUsers.userId, userId)).limit(1)
    companyId = cu?.companyId ?? null
  }

  if (!companyId) {
    return NextResponse.json({
      company_id: null,
      my_tickets_count: 0,
      tickets_by_type: [],
      priority_counts: [],
      time_by_type: [],
      total_time_seconds: 0,
      status_counts: [],
      recent_tickets: [],
      last_due_date: null,
      urgent_due_date: null,
      last_due_ticket: null,
      urgent_due_ticket: null,
    })
  }

  // Support tickets only for company (exclude spam/trash from portal stats)
  const myTickets = await db
    .select({
      id: tickets.id,
      typeId: tickets.typeId,
      priorityId: tickets.priorityId,
      status: tickets.status,
      title: tickets.title,
      dueDate: tickets.dueDate,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .where(and(eq(tickets.companyId, companyId), eq(tickets.ticketType, DEFAULT_TICKET_TYPE)))

  const typeIds = [...new Set(myTickets.map((t) => t.typeId).filter(Boolean))] as number[]
  const typeMap: Record<number, { title: string; color: string }> = {}
  if (typeIds.length > 0) {
    const types = await db.select({ id: ticketTypes.id, title: ticketTypes.title, color: ticketTypes.color }).from(ticketTypes).where(inArray(ticketTypes.id, typeIds))
    types.forEach((t) => { typeMap[t.id] = { title: t.title, color: t.color ?? '#1890ff' } })
  }
  const typeCounts: Record<string | number, { type_title: string; type_id: number | null; count: number; color: string }> = {}
  myTickets.forEach((t) => {
    const key = t.typeId ?? 'none'
    const label = t.typeId ? (typeMap[t.typeId]?.title ?? 'Unknown') : 'No Type'
    const color = t.typeId ? (typeMap[t.typeId]?.color ?? '#1890ff') : '#d9d9d9'
    if (!typeCounts[key]) typeCounts[key] = { type_title: label, type_id: t.typeId ?? null, count: 0, color }
    typeCounts[key].count += 1
  })
  const ticketsByType = Object.values(typeCounts)

  const allPriorities = await db.select({ id: ticketPriorities.id, slug: ticketPriorities.slug, title: ticketPriorities.title, color: ticketPriorities.color, sortOrder: ticketPriorities.sortOrder }).from(ticketPriorities).orderBy(ticketPriorities.sortOrder)
  const pCounts: Record<number, number> = {}
  myTickets.forEach((t) => { pCounts[t.priorityId ?? 0] = (pCounts[t.priorityId ?? 0] ?? 0) + 1 })
  const priorityCounts = allPriorities.map((p) => ({
    priority_id: p.id,
    priority_title: p.title,
    count: pCounts[p.id] ?? 0,
    color: p.color ?? '#000',
  }))

  const myTicketIds = myTickets.map((t) => t.id)
  const timeByType: Array<{ type_title: string; seconds: number; color: string }> = []
  let totalTimeSeconds = 0
  if (myTicketIds.length > 0) {
    const trackerRows = await db.select({ ticketId: ticketTimeTracker.ticketId, durationSeconds: ticketTimeTracker.durationSeconds }).from(ticketTimeTracker).where(inArray(ticketTimeTracker.ticketId, myTicketIds))
    const ticketToType: Record<number, number | null> = {}
    myTickets.forEach((t) => { ticketToType[t.id] = t.typeId })
    const secondsByType: Record<number | string, number> = {}
    trackerRows.forEach((r) => {
      const dur = r.durationSeconds ?? 0
      totalTimeSeconds += dur
      const tid = ticketToType[r.ticketId] ?? 'none'
      secondsByType[tid] = (secondsByType[tid] ?? 0) + dur
    })
    Object.entries(secondsByType).forEach(([tid, sec]) => {
      const typeId = tid === 'none' ? null : parseInt(tid, 10)
      timeByType.push({ type_title: typeId ? (typeMap[typeId]?.title ?? 'Unknown') : 'No Type', seconds: sec, color: typeId ? (typeMap[typeId]?.color ?? '#1890ff') : '#d9d9d9' })
    })
  }

  const statusRows = await db.select({ slug: ticketStatuses.slug, customerTitle: ticketStatuses.customerTitle, title: ticketStatuses.title, color: ticketStatuses.color, sortOrder: ticketStatuses.sortOrder }).from(ticketStatuses).orderBy(asc(ticketStatuses.sortOrder))
  const sCounts: Record<string, number> = {}
  myTickets.forEach((t) => { sCounts[t.status ?? 'unknown'] = (sCounts[t.status ?? 'unknown'] ?? 0) + 1 })
  const statusCounts = statusRows.map((s) => ({
    status_slug: s.slug,
    status_title: s.customerTitle ?? s.title,
    count: sCounts[s.slug] ?? 0,
    color: s.color ?? '#000',
  }))

  // recent_tickets: 5 tickets, urutkan priority (urgent dulu) lalu due_date (terdekat dulu)
  // Urutan eksplisit: urgent/critical=0, high=1, medium=2, low=3. Fallback: sortOrder dari DB (rendah=tinggi).
  const slugToRank: Record<string, number> = { urgent: 0, critical: 0, high: 1, medium: 2, low: 3 }
  const minSortOrder = Math.min(...allPriorities.map((x) => x.sortOrder ?? 999))
  const priorityRankMap: Record<number, number> = {}
  allPriorities.forEach((p) => {
    const slug = (p.slug ?? '').toLowerCase().trim()
    const rank = slug in slugToRank ? slugToRank[slug] : ((p.sortOrder ?? 999) - minSortOrder)
    priorityRankMap[p.id] = rank
  })
  const sortedForRecent = [...myTickets].sort((a, b) => {
    const pa = a.priorityId != null ? (priorityRankMap[Number(a.priorityId)] ?? 999) : 999
    const pb = b.priorityId != null ? (priorityRankMap[Number(b.priorityId)] ?? 999) : 999
    if (pa !== pb) return pa - pb // priority dulu (urgent=0 paling atas)
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
    return da - db // due_date terdekat dulu
  })
  const recentIds = sortedForRecent.slice(0, 5).map((t) => t.id)
  let recentTickets: Array<{
    id: number
    title: string
    due_date: string | null
    updated_at: string
    status_slug: string
    status_title: string
    customer_title: string
    status_color: string
    priority_id: number | null
    priority_title: string
    priority_color: string
    assignee_name: string | null
    company_name: string | null
    tags: Array<{ id: string; name: string; color: string | null }>
  }> = []

  if (recentIds.length > 0) {
    const rows = await db.select({ ticket: tickets, company: companies, priority: ticketPriorities, statusRow: ticketStatuses }).from(tickets).leftJoin(companies, eq(tickets.companyId, companies.id)).leftJoin(ticketPriorities, eq(tickets.priorityId, ticketPriorities.id)).leftJoin(ticketStatuses, eq(tickets.status, ticketStatuses.slug)).where(inArray(tickets.id, recentIds))
    const assigneeRows = await db.select({ ticketId: ticketAssignees.ticketId, user: users }).from(ticketAssignees).leftJoin(users, eq(ticketAssignees.userId, users.id)).where(inArray(ticketAssignees.ticketId, recentIds))
    const assigneeByTicket: Record<number, string> = {}
    assigneeRows.forEach((r) => { assigneeByTicket[r.ticketId] = r.user?.fullName || r.user?.email || 'Unknown' })

    const tagRows = await db.select({ ticketId: ticketTags.ticketId, tag: tags }).from(ticketTags).leftJoin(tags, eq(ticketTags.tagId, tags.id)).where(inArray(ticketTags.ticketId, recentIds))
    const tagsByTicketId: Record<number, Array<{ id: string; name: string; color: string | null }>> = {}
    tagRows.forEach((row) => {
      if (!row.tag) return
      if (!tagsByTicketId[row.ticketId]) tagsByTicketId[row.ticketId] = []
      tagsByTicketId[row.ticketId].push({ id: row.tag.id, name: row.tag.name, color: row.tag.color })
    })

    const orderMap: Record<number, number> = {}
    recentIds.forEach((id, i) => { orderMap[id] = i })
    recentTickets = rows.map((r) => ({
      id: r.ticket.id,
      title: r.ticket.title,
      due_date: r.ticket.dueDate ? new Date(r.ticket.dueDate).toISOString() : null,
      updated_at: r.ticket.updatedAt ? new Date(r.ticket.updatedAt).toISOString() : '',
      status_slug: r.ticket.status,
      status_title: r.statusRow?.customerTitle ?? r.statusRow?.title ?? r.ticket.status,
      customer_title: r.statusRow?.customerTitle ?? 'Unknown',
      status_color: r.statusRow?.color ?? '#000',
      priority_id: r.ticket.priorityId ?? null,
      priority_title: r.priority?.title ?? 'N/A',
      priority_color: r.priority?.color ?? '#000',
      assignee_name: assigneeByTicket[r.ticket.id] ?? null,
      company_name: r.company?.name ?? null,
      tags: tagsByTicketId[r.ticket.id] ?? [],
    })).sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999))
  }

  // ETA: due_date terdekat, jika ada beberapa dengan tanggal sama → ambil yang prioritas tertinggi (urgent dulu)
  const ticketsWithDue = myTickets.filter((t) => t.dueDate != null)
  let lastDueDate: string | null = null
  let lastDueTicket: { id: number; title: string } | null = null
  if (ticketsWithDue.length > 0) {
    const minDueTime = Math.min(...ticketsWithDue.map((t) => new Date(t.dueDate!).getTime()))
    const atMinDue = ticketsWithDue.filter((t) => new Date(t.dueDate!).getTime() === minDueTime)
    const byPriority = [...atMinDue].sort((a, b) => {
      const pa = a.priorityId != null ? (priorityRankMap[Number(a.priorityId)] ?? 999) : 999
      const pb = b.priorityId != null ? (priorityRankMap[Number(b.priorityId)] ?? 999) : 999
      return pa - pb
    })
    const t0 = byPriority[0]
    if (t0) {
      lastDueDate = t0.dueDate ? new Date(t0.dueDate).toISOString() : null
      lastDueTicket = { id: t0.id, title: t0.title ?? 'Untitled' }
    }
  }

  // Urgent ETA: due_date terdekat dari ticket dengan prioritas urgent (match slug/title atau sortOrder tertinggi)
  const urgentPriority =
    allPriorities.find((p) => p.slug?.toLowerCase() === 'urgent' || p.title?.toLowerCase() === 'urgent') ??
    allPriorities.find((p) => (p.sortOrder ?? 999) === Math.min(...allPriorities.map((x) => x.sortOrder ?? 999)))
  const urgentPriorityId = urgentPriority ? Number(urgentPriority.id) : null
  const urgentTicketsWithDue = urgentPriorityId != null
    ? myTickets.filter((t) => Number(t.priorityId) === urgentPriorityId && t.dueDate != null)
    : []
  let urgentDueDate: string | null = null
  let urgentDueTicket: { id: number; title: string } | null = null
  if (urgentTicketsWithDue.length > 0) {
    const minUrgentTime = Math.min(...urgentTicketsWithDue.map((t) => new Date(t.dueDate!).getTime()))
    const urgentMinTicket = urgentTicketsWithDue.find((t) => new Date(t.dueDate!).getTime() === minUrgentTime)
    if (urgentMinTicket) {
      urgentDueDate = urgentMinTicket.dueDate ? new Date(urgentMinTicket.dueDate).toISOString() : null
      urgentDueTicket = { id: urgentMinTicket.id, title: urgentMinTicket.title ?? 'Untitled' }
    }
  }

  const payload: Record<string, unknown> = {
    company_id: companyId,
    my_tickets_count: myTickets.length,
    tickets_by_type: ticketsByType,
    priority_counts: priorityCounts,
    time_by_type: timeByType,
    total_time_seconds: totalTimeSeconds,
    status_counts: statusCounts,
    recent_tickets: recentTickets,
    last_due_date: lastDueDate,
    urgent_due_date: urgentDueDate,
    last_due_ticket: lastDueTicket,
    urgent_due_ticket: urgentDueTicket,
  }

  if (debug) {
    payload._debug = {
      urgent_priority_id: urgentPriorityId,
      urgent_priority_slug: urgentPriority?.slug,
      urgent_priority_title: urgentPriority?.title,
      all_priorities: allPriorities.map((p) => ({ id: p.id, slug: p.slug, title: p.title })),
      urgent_tickets_with_due_count: urgentTicketsWithDue.length,
      my_tickets_sample: myTickets.slice(0, 5).map((t) => ({
        id: t.id,
        priorityId: t.priorityId,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      })),
    }
  }

  return NextResponse.json(payload)
}
