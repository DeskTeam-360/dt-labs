import { and, asc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { customerTicketsAccessCondition } from '@/lib/customer-ticket-access'
import { db } from '@/lib/db'
import {
  companies,
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

/** GET /api/customer/dashboard - Stats for customer dashboard. */
export async function GET(request: Request) {
  const session = await auth()
  const { searchParams } = new URL(request.url)
  const debug = searchParams.get('debug') === '1'
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const companyId = await getCustomerCompanyId(userId)

  // Support tickets: perusahaan + milik pribadi tanpa company (exclude spam/trash)
  const myTickets = await db
    .select({
      id: tickets.id,
      typeId: tickets.typeId,
      priority: tickets.priority,
      status: tickets.status,
      title: tickets.title,
      dueDate: tickets.dueDate,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .where(and(customerTicketsAccessCondition(userId, companyId), eq(tickets.ticketType, DEFAULT_TICKET_TYPE)))

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
  myTickets.forEach((t) => {
    const v = Number(t.priority ?? 0)
    pCounts[v] = (pCounts[v] ?? 0) + 1
  })
  const priorityCounts = Object.entries(pCounts)
    .map(([k, count]) => ({ priority: Number(k), count }))
    .sort((a, b) => a.priority - b.priority)

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

  const sortedForRecent = [...myTickets].sort((a, b) => {
    const pa = Number(a.priority ?? 0)
    const pb = Number(b.priority ?? 0)
    if (pa !== pb) return pa - pb
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
    const dbTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
    return da - dbTime
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
    priority: number
    priority_label: string
    priority_color: string
    assignee_name: string | null
    company_name: string | null
    tags: Array<{ id: string; name: string; color: string | null }>
  }> = []

  if (recentIds.length > 0) {
    const rows = await db
      .select({ ticket: tickets, company: companies, statusRow: ticketStatuses })
      .from(tickets)
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .leftJoin(ticketStatuses, eq(tickets.status, ticketStatuses.slug))
      .where(inArray(tickets.id, recentIds))
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
    const prioRef = new Map<number, { title: string; color: string }>()
    for (const p of allPriorities) {
      const key = Number(p.sortOrder ?? p.id)
      if (!prioRef.has(key)) prioRef.set(key, { title: p.title, color: p.color ?? '#000' })
    }
    recentTickets = rows.map((r) => ({
      id: r.ticket.id,
      title: r.ticket.title,
      due_date: r.ticket.dueDate ? new Date(r.ticket.dueDate).toISOString() : null,
      updated_at: r.ticket.updatedAt ? new Date(r.ticket.updatedAt).toISOString() : '',
      status_slug: r.ticket.status,
      status_title: r.statusRow?.customerTitle ?? r.statusRow?.title ?? r.ticket.status,
      customer_title: r.statusRow?.customerTitle ?? 'Unknown',
      status_color: r.statusRow?.color ?? '#000',
      priority: Number(r.ticket.priority ?? 0),
      priority_label: (() => {
        const pr = prioRef.get(Number(r.ticket.priority ?? 0))
        return pr?.title ? `${pr.title} (${r.ticket.priority})` : `Prioritas ${r.ticket.priority ?? 0}`
      })(),
      priority_color: prioRef.get(Number(r.ticket.priority ?? 0))?.color ?? '#8c8c8c',
      assignee_name: assigneeByTicket[r.ticket.id] ?? null,
      company_name: r.company?.name ?? null,
      tags: tagsByTicketId[r.ticket.id] ?? [],
    })).sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999))
  }

  const ticketsWithDue = myTickets.filter((t) => t.dueDate != null)
  let lastDueDate: string | null = null
  let lastDueTicket: { id: number; title: string } | null = null
  if (ticketsWithDue.length > 0) {
    const minDueTime = Math.min(...ticketsWithDue.map((t) => new Date(t.dueDate!).getTime()))
    const atMinDue = ticketsWithDue.filter((t) => new Date(t.dueDate!).getTime() === minDueTime)
    const t0 = [...atMinDue].sort((a, b) => a.id - b.id)[0]
    if (t0) {
      lastDueDate = t0.dueDate ? new Date(t0.dueDate).toISOString() : null
      lastDueTicket = { id: t0.id, title: t0.title ?? 'Untitled' }
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
    last_due_ticket: lastDueTicket,
  }

  if (debug) {
    payload._debug = {
      tickets_with_due_count: ticketsWithDue.length,
      my_tickets_sample: myTickets.slice(0, 5).map((t) => ({
        id: t.id,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      })),
    }
  }

  return NextResponse.json(payload)
}
