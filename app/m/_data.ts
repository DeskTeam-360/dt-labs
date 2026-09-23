import { and, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'

import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
import {
  companies,
  db,
  teams,
  ticketAssignees,
  ticketComments,
  tickets,
  ticketStatuses,
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
  return session.user as { id: string; name?: string | null; email?: string | null; role?: string }
}

export async function getMobileTickets() {
  const user = await getMobileSession()
  if (!user) return null

  const isCustomer = user.role?.toLowerCase() === 'customer'

  // ticketStatuses catalog: slug → title/color
  const allStatuses = await db
    .select({ slug: ticketStatuses.slug, title: ticketStatuses.title, color: ticketStatuses.color })
    .from(ticketStatuses)
  const statusMap = Object.fromEntries(allStatuses.map((s) => [s.slug, s]))

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

  const rows = await db
    .select({ id: tickets.id, title: tickets.title, priority: tickets.priority, status: tickets.status, companyId: tickets.companyId, createdAt: tickets.createdAt })
    .from(tickets)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tickets.createdAt))
    .limit(50)

  const companyIds = [...new Set(rows.map((r) => r.companyId).filter(Boolean))] as string[]
  const companyRows = companyIds.length
    ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds))
    : []
  const companyMap = Object.fromEntries(companyRows.map((c) => [c.id, c.name]))

  return rows.map((r) => {
    const st = statusMap[r.status] ?? { title: r.status, color: '#8c8c8c' }
    return {
      id: r.id,
      title: r.title,
      priority: numToPriority(r.priority),
      status: st.title,
      statusSlug: r.status,
      statusColor: st.color,
      statusGroup: slugToGroup(r.status),
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
    .select({ id: tickets.id, title: tickets.title, priority: tickets.priority, description: tickets.description, status: tickets.status, companyId: tickets.companyId, createdAt: tickets.createdAt })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (!ticket) return null

  const allStatuses = await db
    .select({ slug: ticketStatuses.slug, title: ticketStatuses.title, color: ticketStatuses.color })
    .from(ticketStatuses)
  const statusMap = Object.fromEntries(allStatuses.map((s) => [s.slug, s]))
  const st = statusMap[ticket.status] ?? { title: ticket.status, color: '#8c8c8c' }

  const [companyRow, assigneeRows, commentRows] = await Promise.all([
    ticket.companyId
      ? db.select({ name: companies.name }).from(companies).where(eq(companies.id, ticket.companyId)).limit(1)
      : Promise.resolve([] as { name: string }[]),
    db.select({ name: users.fullName })
      .from(ticketAssignees)
      .leftJoin(users, eq(ticketAssignees.userId, users.id))
      .where(eq(ticketAssignees.ticketId, ticketId)),
    db.select({ id: ticketComments.id, body: ticketComments.comment, visibility: ticketComments.visibility, authorType: ticketComments.authorType, createdAt: ticketComments.createdAt, authorName: users.fullName })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.userId, users.id))
      .where(
        isCustomer
          ? and(eq(ticketComments.ticketId, ticketId), eq(ticketComments.visibility, 'reply'))
          : eq(ticketComments.ticketId, ticketId)
      )
      .orderBy(ticketComments.createdAt),
  ])

  return {
    id: ticket.id,
    title: ticket.title,
    priority: numToPriority(ticket.priority),
    description: ticket.description ?? '',
    status: st.title,
    statusColor: st.color,
    company: companyRow[0]?.name ?? '—',
    assignee: assigneeRows.map((a) => a.name).filter(Boolean).join(', ') || '—',
    createdAt: ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('id', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    comments: commentRows.map((c) => ({
      id: c.id,
      author: c.authorName ?? 'Unknown',
      role: (c.authorType === 'customer' ? 'customer' : 'agent') as 'customer' | 'agent',
      body: c.body ?? '',
      isNote: c.visibility === 'note',
      createdAt: c.createdAt ? new Date(c.createdAt).toLocaleTimeString('id', { hour: '2-digit', minute: '2-digit' }) : '',
    })),
  }
}

export async function getMobileDashboardStats() {
  const user = await getMobileSession()
  if (!user) return null

  const isCustomer = user.role?.toLowerCase() === 'customer'

  let baseWhere: ReturnType<typeof eq> | ReturnType<typeof and> | undefined
  if (isCustomer) {
    const companyId = await getCustomerCompanyId(user.id)
    baseWhere = companyId ? eq(tickets.companyId, companyId) : eq(tickets.createdBy, user.id)
  }

  const allStatuses = await db.select({ slug: ticketStatuses.slug }).from(ticketStatuses)
  const slugsByGroup = (group: MobileStatusGroup) => allStatuses.filter((s) => slugToGroup(s.slug) === group).map((s) => s.slug)

  const openSlugs = slugsByGroup('open')
  const inProgressSlugs = slugsByGroup('in_progress')
  const needResponseSlugs = slugsByGroup('need_response')
  const completedSlugs = slugsByGroup('completed')

  const countBySlugs = async (slugs: string[]) => {
    if (!slugs.length) return 0
    const [r] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(baseWhere ? and(baseWhere, inArray(tickets.status, slugs)) : inArray(tickets.status, slugs))
    return r?.count ?? 0
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const [open, inProgress, needResponse, completedWeek] = await Promise.all([
    countBySlugs(openSlugs),
    countBySlugs(inProgressSlugs),
    countBySlugs(needResponseSlugs),
    completedSlugs.length
      ? db.select({ count: sql<number>`count(*)::int` }).from(tickets)
          .where(and(baseWhere ?? undefined, inArray(tickets.status, completedSlugs), gte(tickets.updatedAt, weekAgo)))
          .then((r) => r[0]?.count ?? 0)
      : Promise.resolve(0),
  ])

  return { open, inProgress, needResponse, completedThisWeek: completedWeek }
}

export async function getMobileCompaniesAndTeams() {
  const [companyRows, teamRows] = await Promise.all([
    db.select({ id: companies.id, name: companies.name })
      .from(companies)
      .leftJoin(tickets, eq(tickets.companyId, companies.id))
      .groupBy(companies.id, companies.name)
      .orderBy(desc(sql`count(${tickets.id})`))
      .limit(10),
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(teams.name),
  ])
  return { companies: companyRows, teams: teamRows }
}

function numToPriority(p: number | null): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' {
  if (!p) return 'P5'
  if (p <= 1) return 'P1'
  if (p <= 2) return 'P2'
  if (p <= 3) return 'P3'
  if (p <= 4) return 'P4'
  return 'P5'
}
