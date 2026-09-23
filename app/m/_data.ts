import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'

import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
import {
  companies,
  db,
  projectStatuses,
  teamMembers,
  teams,
  ticketAssignees,
  ticketComments,
  tickets,
  users,
} from '@/lib/db'

export type MobileStatusGroup = 'open' | 'in_progress' | 'need_response' | 'completed'

export function slugToGroup(slug: string): MobileStatusGroup {
  const s = slug.toLowerCase().replace(/[\s_]/g, '-')
  if (['completed', 'closed', 'resolved', 'cancel', 'archived'].some((k) => s.includes(k))) return 'completed'
  if (['review', 'question', 'waiting', 'client', 'need-response'].some((k) => s.includes(k))) return 'need_response'
  if (['open', 'received', 'new', 'pending'].some((k) => s.includes(k))) return 'open'
  return 'in_progress'
}

export async function getMobileSession() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session.user as { id: string; name?: string | null; email?: string | null; role?: string; image?: string | null }
}

export async function getMobileTickets(statusGroup?: MobileStatusGroup) {
  const user = await getMobileSession()
  if (!user) return null

  const isCustomer = user.role?.toLowerCase() === 'customer'

  // projectStatuses is the status table linked via tickets.projectStatusId
  const allStatuses = await db
    .select({ id: projectStatuses.id, slug: projectStatuses.slug, name: projectStatuses.name, color: projectStatuses.color })
    .from(projectStatuses)

  let statusIds: number[] | undefined
  if (statusGroup) {
    const matching = allStatuses.filter((s) => slugToGroup(s.slug) === statusGroup).map((s) => s.id)
    if (matching.length === 0) return []
    statusIds = matching
  }

  const conditions = []

  if (isCustomer) {
    const companyId = await getCustomerCompanyId(user.id)
    if (companyId) {
      conditions.push(
        or(
          eq(tickets.companyId, companyId),
          and(eq(tickets.createdBy, user.id), isNull(tickets.companyId)),
        )
      )
    } else {
      conditions.push(eq(tickets.createdBy, user.id))
    }
  }

  if (statusIds) conditions.push(inArray(tickets.projectStatusId, statusIds))

  const rows = await db
    .select({ id: tickets.id, title: tickets.title, priority: tickets.priority, companyId: tickets.companyId, projectStatusId: tickets.projectStatusId, createdAt: tickets.createdAt })
    .from(tickets)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tickets.createdAt))
    .limit(50)

  const statusMap = Object.fromEntries(allStatuses.map((s) => [s.id, s]))

  const companyIds = [...new Set(rows.map((r) => r.companyId).filter(Boolean))] as string[]
  const companyRows = companyIds.length
    ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds))
    : []
  const companyMap = Object.fromEntries(companyRows.map((c) => [c.id, c.name]))

  const priorityLabel = (p: number | null): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' => {
    if (!p) return 'P5'
    if (p <= 1) return 'P1'
    if (p <= 2) return 'P2'
    if (p <= 3) return 'P3'
    if (p <= 4) return 'P4'
    return 'P5'
  }

  return rows.map((r) => {
    const status = r.projectStatusId ? statusMap[r.projectStatusId] : null
    return {
      id: r.id,
      title: r.title,
      priority: priorityLabel(r.priority),
      status: status?.name ?? 'Unknown',
      statusSlug: status?.slug ?? '',
      statusColor: status?.color ?? '#8c8c8c',
      statusGroup: status ? slugToGroup(status.slug) : ('open' as MobileStatusGroup),
      company: r.companyId ? (companyMap[r.companyId] ?? '—') : '—',
      createdAt: r.createdAt ? new Date(r.createdAt).toLocaleDateString('id', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    }
  })
}

export async function getMobileTicketDetail(ticketId: number) {
  const user = await getMobileSession()
  if (!user) return null

  const isCustomer = user.role?.toLowerCase() === 'customer'

  const [ticket] = await db
    .select({ id: tickets.id, title: tickets.title, priority: tickets.priority, description: tickets.description, companyId: tickets.companyId, projectStatusId: tickets.projectStatusId, createdAt: tickets.createdAt })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (!ticket) return null

  const allStatuses = await db
    .select({ id: projectStatuses.id, slug: projectStatuses.slug, name: projectStatuses.name, color: projectStatuses.color })
    .from(projectStatuses)
  const statusMap = Object.fromEntries(allStatuses.map((s) => [s.id, s]))
  const status = ticket.projectStatusId ? statusMap[ticket.projectStatusId] : null

  const [companyRow, assigneeRows, commentRows] = await Promise.all([
    ticket.companyId
      ? db.select({ name: companies.name }).from(companies).where(eq(companies.id, ticket.companyId)).limit(1)
      : Promise.resolve([]),
    db.select({ name: users.name })
      .from(ticketAssignees)
      .leftJoin(users, eq(ticketAssignees.userId, users.id))
      .where(eq(ticketAssignees.ticketId, ticketId)),
    db.select({ id: ticketComments.id, body: ticketComments.body, isNote: ticketComments.isNote, createdAt: ticketComments.createdAt, authorName: users.name, authorRole: users.role })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.userId, users.id))
      .where(
        isCustomer
          ? and(eq(ticketComments.ticketId, ticketId), eq(ticketComments.isNote, false))
          : eq(ticketComments.ticketId, ticketId)
      )
      .orderBy(ticketComments.createdAt),
  ])

  const priorityLabel = (p: number | null): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' => {
    if (!p) return 'P5'
    if (p <= 1) return 'P1'
    if (p <= 2) return 'P2'
    if (p <= 3) return 'P3'
    if (p <= 4) return 'P4'
    return 'P5'
  }

  return {
    id: ticket.id,
    title: ticket.title,
    priority: priorityLabel(ticket.priority),
    description: ticket.description ?? '',
    status: status?.name ?? 'Unknown',
    statusColor: status?.color ?? '#8c8c8c',
    company: (companyRow as { name: string }[])[0]?.name ?? '—',
    assignee: assigneeRows.map((a) => a.name).filter(Boolean).join(', ') || '—',
    createdAt: ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('id', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    comments: commentRows.map((c) => ({
      id: c.id,
      author: c.authorName ?? 'Unknown',
      role: (c.authorRole?.toLowerCase() === 'customer' ? 'customer' : 'agent') as 'customer' | 'agent',
      body: c.body ?? '',
      isNote: c.isNote ?? false,
      createdAt: c.createdAt ? new Date(c.createdAt).toLocaleTimeString('id', { hour: '2-digit', minute: '2-digit' }) : '',
    })),
  }
}

export async function getMobileDashboardStats() {
  const user = await getMobileSession()
  if (!user) return null

  const isCustomer = user.role?.toLowerCase() === 'customer'

  const allStatuses = await db.select({ id: projectStatuses.id, slug: projectStatuses.slug }).from(projectStatuses)

  const openIds = allStatuses.filter((s) => slugToGroup(s.slug) === 'open').map((s) => s.id)
  const inProgressIds = allStatuses.filter((s) => slugToGroup(s.slug) === 'in_progress').map((s) => s.id)
  const needResponseIds = allStatuses.filter((s) => slugToGroup(s.slug) === 'need_response').map((s) => s.id)
  const completedIds = allStatuses.filter((s) => slugToGroup(s.slug) === 'completed').map((s) => s.id)

  let baseWhere: ReturnType<typeof eq> | ReturnType<typeof and> | undefined
  if (isCustomer) {
    const companyId = await getCustomerCompanyId(user.id)
    baseWhere = companyId ? eq(tickets.companyId, companyId) : eq(tickets.createdBy, user.id)
  }

  const countByStatus = async (ids: number[]) => {
    if (!ids.length) return 0
    const [r] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(baseWhere ? and(baseWhere, inArray(tickets.projectStatusId, ids)) : inArray(tickets.projectStatusId, ids))
    return r?.count ?? 0
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [open, inProgress, needResponse, completedWeekRow] = await Promise.all([
    countByStatus(openIds),
    countByStatus(inProgressIds),
    countByStatus(needResponseIds),
    completedIds.length
      ? db.select({ count: sql<number>`count(*)::int` }).from(tickets).where(
          and(baseWhere ?? undefined, inArray(tickets.projectStatusId, completedIds), gte(tickets.updatedAt, weekAgo))
        ).then((r) => r[0])
      : Promise.resolve({ count: 0 }),
  ])

  return { open, inProgress, needResponse, completedThisWeek: completedWeekRow?.count ?? 0 }
}

export async function getMobileCompaniesAndTeams() {
  const [companyRows, teamRows] = await Promise.all([
    db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(companies.name).limit(50),
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(teams.name).limit(50),
  ])
  return { companies: companyRows, teams: teamRows }
}
