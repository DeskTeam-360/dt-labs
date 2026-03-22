import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  tickets,
  users,
  teams,
  ticketTypes,
  ticketPriorities,
  companies,
  companyUsers,
  ticketAssignees,
  ticketChecklist,
  ticketTags,
  tags,
  ticketComments,
  ticketAttachments,
  teamMembers,
} from '@/lib/db'
import { runAutomationRules } from '@/lib/automation-engine'
import { eq, inArray, desc, and, or, ilike, gte, lte } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000

/** GET /api/tickets - List tickets with related data (server-side filtering). Customer: only tickets of their company */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id!
  const role = (session.user as { role?: string }).role?.toLowerCase()

  // Customer: hanya ticket yang company-nya sama
  let forcedCompanyIds: string[] = []
  if (role === 'customer') {
    const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
    let companyId = userRow?.companyId ?? null
    if (!companyId) {
      const [cu] = await db.select({ companyId: companyUsers.companyId }).from(companyUsers).where(eq(companyUsers.userId, userId)).limit(1)
      companyId = cu?.companyId ?? null
    }
    if (!companyId) {
      return NextResponse.json([])
    }
    forcedCompanyIds = [companyId]
  }

  const url = new URL(request.url)
  const companyIdParam = url.searchParams.get('company_id')
  const companyIdsParam = url.searchParams.get('company_ids')
  const companyIds = forcedCompanyIds.length > 0
    ? forcedCompanyIds
    : companyIdsParam
      ? companyIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : companyIdParam
        ? [companyIdParam.trim()]
        : []
  const statusParam = url.searchParams.get('status')
  const typeIdParam = url.searchParams.get('type_id')
  const typeIdsParam = url.searchParams.get('type_ids')
  const tagIdsParam = url.searchParams.get('tag_ids')
  const visibilityParam = url.searchParams.get('visibility')
  const teamIdParam = url.searchParams.get('team_id')
  const teamIdsParam = url.searchParams.get('team_ids')
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  const search = url.searchParams.get('search')?.trim()
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10)),
    MAX_LIMIT
  )
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const statusSlugs = statusParam ? statusParam.split(',').map((s) => s.trim()).filter(Boolean) : []
  const tagIds = tagIdsParam ? tagIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : []
  const visibilityValues = visibilityParam ? visibilityParam.split(',').map((s) => s.trim()).filter(Boolean) : []
  const typeIds = typeIdsParam
    ? typeIdsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    : typeIdParam
      ? (() => { const n = parseInt(typeIdParam, 10); return isNaN(n) ? [] : [n] })()
      : []
  const teamIds = teamIdsParam
    ? teamIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : teamIdParam
      ? [teamIdParam.trim()]
      : []

  /**
   * Visibility access: user can only see tickets they have access to.
   * - public: everyone
   * - private: only creator
   * - specific_users: only assignees (filter shows as "Private")
   * - team: only members of ticket's team (ticket must have team_id)
   */
  const visibilityAccess = or(
    eq(tickets.visibility, 'public'),
    and(eq(tickets.visibility, 'private'), eq(tickets.createdBy, userId)),
    sql`(${tickets.visibility} = 'specific_users' AND ${tickets.id} IN (SELECT ticket_id FROM ticket_assignees WHERE user_id = ${userId}))`,
    sql`(${tickets.visibility} = 'team' AND ${tickets.teamId} IN (SELECT team_id FROM team_members WHERE user_id = ${userId}))`
  )!

  /** When filter visibility=private (or old specific_users), include both - Private filter shows tickets for creator/assignees */
  let visibilityFilterValues = visibilityValues
  if (visibilityValues.includes('private') || visibilityValues.includes('specific_users')) {
    visibilityFilterValues = visibilityFilterValues.filter((v) => v !== 'private' && v !== 'specific_users')
    if (!visibilityFilterValues.includes('specific_users')) visibilityFilterValues.push('specific_users')
    if (!visibilityFilterValues.includes('private')) visibilityFilterValues.push('private')
  }

  const conditions: ReturnType<typeof eq>[] = [visibilityAccess]
  if (companyIds.length > 0) conditions.push(inArray(tickets.companyId, companyIds))
  if (statusSlugs.length > 0) conditions.push(inArray(tickets.status, statusSlugs))
  if (typeIds.length > 0) conditions.push(inArray(tickets.typeId, typeIds))
  if (teamIds.length > 0) conditions.push(inArray(tickets.teamId, teamIds))
  if (visibilityFilterValues.length > 0) conditions.push(inArray(tickets.visibility, visibilityFilterValues))
  if (dateFrom) {
    const d = new Date(dateFrom)
    if (!isNaN(d.getTime())) conditions.push(gte(tickets.createdAt, d))
  }
  if (dateTo) {
    const d = new Date(dateTo)
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999)
      conditions.push(lte(tickets.createdAt, d))
    }
  }
  if (search) {
    const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`
    conditions.push(or(ilike(tickets.title, pattern), ilike(tickets.description, pattern))!)
  }
  if (tagIds.length > 0) {
    conditions.push(
      sql`${tickets.id} IN (SELECT ticket_id FROM ticket_tags WHERE tag_id IN (${sql.join(tagIds.map((id) => sql`${id}`), sql`, `)}))`
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const baseQuery = db
    .select({
      ticket: tickets,
      creator: users,
      team: teams,
      type: ticketTypes,
      priority: ticketPriorities,
      company: companies,
    })
    .from(tickets)
    .leftJoin(users, eq(tickets.createdBy, users.id))
    .leftJoin(teams, eq(tickets.teamId, teams.id))
    .leftJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
    .leftJoin(ticketPriorities, eq(tickets.priorityId, ticketPriorities.id))
    .leftJoin(companies, eq(tickets.companyId, companies.id))

  const ticketsRows = whereClause
    ? await baseQuery.where(whereClause).orderBy(desc(tickets.createdAt)).limit(limit).offset(offset)
    : await baseQuery.orderBy(desc(tickets.createdAt)).limit(limit).offset(offset)

  const ticketIds = ticketsRows.map((r) => r.ticket.id)

  const [assigneesRows, checklistRows, tagsRows, repliesRows] =
    ticketIds.length > 0
      ? await Promise.all([
          db
            .select({
              ticketId: ticketAssignees.ticketId,
              id: ticketAssignees.id,
              userId: ticketAssignees.userId,
              user: users,
            })
            .from(ticketAssignees)
            .leftJoin(users, eq(ticketAssignees.userId, users.id))
            .where(inArray(ticketAssignees.ticketId, ticketIds)),
          db
            .select()
            .from(ticketChecklist)
            .where(inArray(ticketChecklist.ticketId, ticketIds)),
          db
            .select({
              ticketId: ticketTags.ticketId,
              tagId: ticketTags.tagId,
              tag: tags,
            })
            .from(ticketTags)
            .leftJoin(tags, eq(ticketTags.tagId, tags.id))
            .where(inArray(ticketTags.ticketId, ticketIds)),
          db
            .select({ ticketId: ticketComments.ticketId, createdAt: ticketComments.createdAt })
            .from(ticketComments)
            .where(and(eq(ticketComments.visibility, 'reply'), inArray(ticketComments.ticketId, ticketIds))),
        ])
      : [[], [], [], []]

  const latestReplies: Record<number, string> = {}
  repliesRows.forEach((r) => {
    const createdAtStr = r.createdAt ? new Date(r.createdAt).toISOString() : ''
    const cur = latestReplies[r.ticketId]
    if (!cur || createdAtStr > cur) latestReplies[r.ticketId] = createdAtStr
  })

  const tagsByTicket: Record<number, Array<{ id: string; name: string; slug: string; color?: string }>> = {}
  tagsRows.forEach((row) => {
    const tag = row.tag
    if (!tag) return
    if (!tagsByTicket[row.ticketId]) tagsByTicket[row.ticketId] = []
    tagsByTicket[row.ticketId].push({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      color: tag.color ?? undefined,
    })
  })

  const assigneesByTicket: Record<
    number,
    Array<{ id: string; user_id: string; user_name: string }>
  > = {}
  assigneesRows.forEach((row) => {
    const name = row.user?.fullName || row.user?.email || 'Unknown'
    if (!assigneesByTicket[row.ticketId]) assigneesByTicket[row.ticketId] = []
    assigneesByTicket[row.ticketId].push({
      id: row.id,
      user_id: row.userId,
      user_name: name,
    })
  })

  const checklistByTicket: Record<
    number,
    { completed: number; total: number; items: unknown[] }
  > = {}
  checklistRows.forEach((row) => {
    if (!checklistByTicket[row.ticketId])
      checklistByTicket[row.ticketId] = { completed: 0, total: 0, items: [] }
    checklistByTicket[row.ticketId].total++
    if (row.isCompleted) checklistByTicket[row.ticketId].completed++
    checklistByTicket[row.ticketId].items.push(row)
  })

  const result = ticketsRows.map((r) => {
    const t = r.ticket
    const cl = checklistByTicket[t.id] || { completed: 0, total: 0, items: [] }
    const lastReadAt = t.lastReadAt ? new Date(t.lastReadAt).toISOString() : null
    const latestReplyAt = latestReplies[t.id]
    const hasUnread = !!latestReplyAt && (!lastReadAt || latestReplyAt > lastReadAt)
    const creatorName = r.creator?.fullName || r.creator?.email || 'Unknown'
    const companyName = r.company?.name

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      short_note: t.shortNote ?? null,
      created_by: t.createdBy,
      due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      status: t.status,
      visibility: t.visibility,
      team_id: t.teamId,
      type_id: t.typeId,
      priority_id: t.priorityId,
      company_id: t.companyId,
      created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
      updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
      creator: r.creator
        ? { id: r.creator.id, full_name: r.creator.fullName, email: r.creator.email }
        : null,
      team: r.team ? { id: r.team.id, name: r.team.name } : null,
      type: r.type ? { id: r.type.id, title: r.type.title, slug: r.type.slug, color: r.type.color } : null,
      priority: r.priority
        ? { id: r.priority.id, title: r.priority.title, slug: r.priority.slug, color: r.priority.color }
        : null,
      company: r.company
        ? { id: r.company.id, name: r.company.name, color: r.company.color, email: r.company.email }
        : null,
      creator_name: creatorName,
      by_label: companyName || creatorName,
      team_name: r.team?.name ?? null,
      tags: tagsByTicket[t.id] || [],
      assignees: assigneesByTicket[t.id] || [],
      checklist_items: cl.items,
      checklist_completed: cl.completed,
      checklist_total: cl.total,
      last_read_at: lastReadAt,
      has_unread_replies: hasUnread,
    }
  })

  return NextResponse.json(result)
}

/** POST /api/tickets - Create ticket */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    title,
    description,
    short_note,
    status,
    visibility,
    team_id,
    type_id,
    priority_id,
    company_id,
    due_date,
    assignees = [],
    tag_ids = [],
    attachments = [],
    created_via: bodyCreatedVia,
  } = body

  /** created_via: 'portal' (admin app) | 'website' (embed/widget) | 'app' (mobile/external) - for automation conditions */
  const createdVia = bodyCreatedVia || 'portal'

  const userId = session.user.id!
  const role = (session.user as { role?: string }).role?.toLowerCase()
  let resolvedCompanyId = company_id || null
  if (role === 'customer' && !resolvedCompanyId) {
    const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
    let cid = userRow?.companyId ?? null
    if (!cid) {
      const [cu] = await db.select({ companyId: companyUsers.companyId }).from(companyUsers).where(eq(companyUsers.userId, userId)).limit(1)
      cid = cu?.companyId ?? null
    }
    resolvedCompanyId = cid
  }

  const [newTicket] = await db
    .insert(tickets)
    .values({
      title: title || 'Untitled',
      description: description || null,
      shortNote: short_note ?? null,
      status: status || 'to_do',
      visibility: visibility || 'private',
      teamId: team_id || null,
      typeId: type_id ?? null,
      priorityId: priority_id ?? null,
      companyId: resolvedCompanyId,
      dueDate: due_date ? new Date(due_date) : null,
      createdBy: session.user.id,
      createdVia,
    })
    .returning()

  if (!newTicket) {
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  }

  if (assignees.length > 0) {
    await db.insert(ticketAssignees).values(
      assignees.map((userId: string) => ({
        ticketId: newTicket.id,
        userId,
      }))
    )
  }

  if (tag_ids.length > 0) {
    await db.insert(ticketTags).values(
      tag_ids.map((tagId: string) => ({
        ticketId: newTicket.id,
        tagId,
      }))
    )
  }

  try {
    const assigneesList = Array.isArray(assignees) ? assignees : []
    await runAutomationRules('ticket_created', {
      id: newTicket.id,
      title: title || 'Untitled',
      description: description || null,
      status: status || 'to_do',
      priority_slug: null,
      company_id: company_id || null,
      created_via: createdVia,
      team_id: team_id || null,
      visibility: visibility || 'private',
      assignee_ids: assigneesList,
    })
  } catch (autoErr) {
    console.error('Automation rules error:', autoErr)
  }

  if (attachments.length > 0) {
    await db.insert(ticketAttachments).values(
      attachments.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        ticketId: newTicket.id,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: session.user.id,
      }))
    )
  }

  return NextResponse.json({
    id: newTicket.id,
    created_at: newTicket.createdAt ? new Date(newTicket.createdAt).toISOString() : '',
    updated_at: newTicket.updatedAt ? new Date(newTicket.updatedAt).toISOString() : '',
  })
}
