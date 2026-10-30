import { and, type AnyColumn, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, type SQL, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getCustomerCompanyIds } from '@/lib/customer-company'
import { customerTicketsAccessCondition } from '@/lib/customer-ticket-access'
import { db } from '@/lib/db'
import { companies, tags, teamMembers, teams, ticketAssignees, ticketAttachments, ticketChecklist, ticketComments, tickets, ticketTags, ticketTypes, users } from '@/lib/db'
import { getPublicUrl } from '@/lib/storage-idrive'
import { coerceTicketType, DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { createTicket } from '@/lib/ticket-create'
import { getLastActivity } from '@/lib/ticket-last-activity'


const DEFAULT_LIMIT = 50
/** Max tickets per list request (UI: 50 / 100 / 200 / 500). */
const MAX_LIMIT = 500
/** GET /api/tickets - List tickets with related data (server-side filtering). Customer: only tickets of their company */
export async function GET(request: Request) {
  const session = await auth()
  const authUser = session?.user
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = authUser.id
  const role = (authUser as { role?: string }).role?.toLowerCase()
  const isCustomerViewer = role === 'customer'

  // Customer: company tickets + personal tickets without company (owner)
  let customerCompanyIds: string[] = []
  if (isCustomerViewer) {
    customerCompanyIds = await getCustomerCompanyIds(userId)
  }

  const url = new URL(request.url)
  const companyIdParam = url.searchParams.get('company_id')
  const companyIdsParam = url.searchParams.get('company_ids')
  const companyIds = companyIdsParam
      ? companyIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : companyIdParam
        ? [companyIdParam.trim()]
        : []
  const statusParam = url.searchParams.get('status')
  const typeIdParam = url.searchParams.get('type_id')
  const typeIdsParam = url.searchParams.get('type_ids')
  const tagIdsParam = url.searchParams.get('tag_ids')
  const noCompany = url.searchParams.get('no_company') === '1'
  const noTags = url.searchParams.get('no_tags') === '1'
  const noTeam = url.searchParams.get('no_team') === '1'
  const teamIdParam = url.searchParams.get('team_id')
  const teamIdsParam = url.searchParams.get('team_ids')
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  const dueDateFrom = url.searchParams.get('due_date_from')
  const dueDateTo = url.searchParams.get('due_date_to')
  const search = url.searchParams.get('search')?.trim()
  const searchBy = url.searchParams.get('search_by')?.trim() || 'all' // 'all' | 'title' | 'id'
  // search_fields: comma-separated subset — title,description,comments,properties
  const searchFieldsRaw = url.searchParams.get('search_fields')
  const searchFields = searchFieldsRaw
    ? new Set(searchFieldsRaw.split(',').map((s) => s.trim()).filter(Boolean))
    : null
  const paginated = url.searchParams.get('paginated') === '1'
  const sortOrder = url.searchParams.get('sort_order') === 'asc' ? 'asc' : 'desc'
  const sortByParam = url.searchParams.get('sort_by')?.trim() || ''
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10)),
    MAX_LIMIT
  )
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const statusSlugs = statusParam ? statusParam.split(',').map((s) => s.trim()).filter(Boolean) : []
  const tagIds = tagIdsParam ? tagIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : []
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
  const ticketTypeFilter = url.searchParams.get('ticket_type')?.trim().toLowerCase()

  /**
   * Visibility access (non-admin agents): legacy public/private/specific_users plus
   * configured levels (team, account_manager, team_leader, admin, project_manager).
   */

  const isCustomerList = role === 'customer'
  const isAdminList = isAdmin(role as string | undefined)

  // Fetch the teams this user belongs to (for team-based ticket access control)
  let userTeamIds: string[] = []
  if (!isAdminList && !isCustomerList) {
    const teamRows = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
    userTeamIds = teamRows.map((r) => r.teamId)
  }

  const conditions: SQL[] = []
  if (isCustomerList) {
    conditions.push(await customerTicketsAccessCondition(userId, customerCompanyIds))
    if (companyIds.length > 0) conditions.push(inArray(tickets.companyId, companyIds))
  } else if (isAdminList) {
    if (companyIds.length > 0) conditions.push(inArray(tickets.companyId, companyIds))
  } else {
    if (companyIds.length > 0) conditions.push(inArray(tickets.companyId, companyIds))
    // Team access: unassigned OR public team OR user is a member of the ticket's team
    const publicTeamSubq = sql`(SELECT id FROM teams WHERE type = 'public')`
    const teamAccessCond = userTeamIds.length > 0
      ? or(isNull(tickets.teamId), sql`${tickets.teamId} IN ${publicTeamSubq}`, inArray(tickets.teamId, userTeamIds))!
      : or(isNull(tickets.teamId), sql`${tickets.teamId} IN ${publicTeamSubq}`)!
    conditions.push(teamAccessCond)
  }
  if (statusSlugs.length > 0) conditions.push(inArray(tickets.status, statusSlugs))
  if (typeIds.length > 0) conditions.push(inArray(tickets.typeId, typeIds))
  /**
   * Customers never see spam/trash lists (ignore `ticket_type` query).
   * Staff: junk folders via explicit `?ticket_type=spam|trash`; else main list = `support` only.
   * Tickets with classification `project` are excluded from the main list (they live on the project board).
   */
  if (
    role !== 'customer' &&
    (ticketTypeFilter === 'spam' || ticketTypeFilter === 'trash')
  ) {
    conditions.push(eq(tickets.ticketType, ticketTypeFilter))
  } else {
    conditions.push(eq(tickets.ticketType, DEFAULT_TICKET_TYPE))
  }
  if (!isCustomerList) {
    if (teamIds.length > 0) conditions.push(inArray(tickets.teamId, teamIds))
  }
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
  if (dueDateFrom || dueDateTo) {
    conditions.push(isNotNull(tickets.dueDate))
    if (dueDateFrom) {
      const d = new Date(dueDateFrom)
      if (!isNaN(d.getTime())) conditions.push(gte(tickets.dueDate, d))
    }
    if (dueDateTo) {
      const d = new Date(dueDateTo)
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999)
        conditions.push(lte(tickets.dueDate, d))
      }
    }
  }
  if (search) {
    const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`
    const searchAsId = /^\d+$/.test(search) ? parseInt(search, 10) : null
    if (searchBy === 'id') {
      if (searchAsId !== null) conditions.push(eq(tickets.id, searchAsId)!)
      else conditions.push(sql`false`)
    } else if (searchBy === 'title') {
      conditions.push(ilike(tickets.title, pattern)!)
    } else if (searchFields) {
      // granular field selection from preferences
      const parts: ReturnType<typeof ilike>[] = []
      if (searchAsId !== null) parts.push(eq(tickets.id, searchAsId) as ReturnType<typeof ilike>)
      if (searchFields.has('title')) parts.push(ilike(tickets.title, pattern)!)
      if (searchFields.has('description')) parts.push(ilike(tickets.description, pattern)!)
      if (searchFields.has('comments')) parts.push(sql`${tickets.id} IN (SELECT ticket_id FROM ticket_comments WHERE comment ILIKE ${pattern})`)
      if (parts.length > 0) conditions.push(or(...parts)!)
      else conditions.push(sql`false`)
    } else {
      // 'all' default — title + description only (comments excluded for performance)
      if (searchAsId !== null) {
        conditions.push(or(eq(tickets.id, searchAsId), ilike(tickets.title, pattern), ilike(tickets.description, pattern))!)
      } else {
        conditions.push(or(ilike(tickets.title, pattern), ilike(tickets.description, pattern))!)
      }
    }
  }
  if (tagIds.length > 0) {
    conditions.push(
      sql`${tickets.id} IN (SELECT ticket_id FROM ticket_tags WHERE tag_id IN (${sql.join(tagIds.map((id) => sql`${id}`), sql`, `)}))`
    )
  }
  if (noCompany) conditions.push(isNull(tickets.companyId))
  if (noTags) conditions.push(sql`${tickets.id} NOT IN (SELECT ticket_id FROM ticket_tags)`)
  if (noTeam) conditions.push(isNull(tickets.teamId))
  // Board filters (staff only): tickets nobody is assigned to, or assigned to any of the given people.
  if (!isCustomerList) {
    if (url.searchParams.get('unassigned') === '1') {
      conditions.push(sql`NOT EXISTS (SELECT 1 FROM ticket_assignees ta WHERE ta.ticket_id = ${tickets.id})`)
    }
    const assigneeIds = (url.searchParams.get('assignee_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (assigneeIds.length > 0) {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ticket_assignees ta WHERE ta.ticket_id = ${tickets.id} AND ta.user_id IN (${sql.join(assigneeIds.map((id) => sql`${id}`), sql`, `)}))`
      )
    }
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const idOrder = sortOrder === 'asc' ? asc(tickets.id) : desc(tickets.id)
  // Empty values always sort last, whichever direction is chosen.
  const nullsLast = (expr: SQL | AnyColumn) =>
    sortOrder === 'asc' ? sql`${expr} ASC NULLS LAST` : sql`${expr} DESC NULLS LAST`
  const ticketOrder: SQL[] = (() => {
    switch (sortByParam) {
      case 'id':
        return [idOrder]
      case 'created_at':
        return [nullsLast(tickets.createdAt), idOrder]
      case 'updated_at':
        return [nullsLast(tickets.updatedAt), idOrder]
      case 'due_date':
        return [nullsLast(tickets.dueDate), idOrder]
      case 'title':
        return [nullsLast(sql`lower(${tickets.title})`), idOrder]
      case 'status':
        return [nullsLast(tickets.status), idOrder]
      case 'company':
        return [nullsLast(sql`lower(${companies.name})`), idOrder]
      case 'team':
        return [nullsLast(sql`lower(${teams.name})`), idOrder]
      case 'type':
        return [nullsLast(sql`lower(${ticketTypes.title})`), idOrder]
      case 'priority':
        // Unranked (null / 0) tickets stay at the end in both directions.
        return [
          sql`CASE WHEN ${tickets.priority} IS NULL OR ${tickets.priority} <= 0 THEN 1 ELSE 0 END`,
          nullsLast(tickets.priority),
          asc(tickets.companyId),
          idOrder,
        ]
      default:
        return [asc(tickets.priority), asc(tickets.companyId), idOrder]
    }
  })()

  const baseQuery = db
    .select({
      ticket: tickets,
      creator: users,
      team: teams,
      type: ticketTypes,
      company: companies,
    })
    .from(tickets)
    .leftJoin(users, eq(tickets.createdBy, users.id))
    .leftJoin(teams, eq(tickets.teamId, teams.id))
    .leftJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
    .leftJoin(companies, eq(tickets.companyId, companies.id))

  const ticketsRows = whereClause
    ? await baseQuery
        .where(whereClause)
        .orderBy(...ticketOrder)
        .limit(limit)
        .offset(offset)
    : await baseQuery
        .orderBy(...ticketOrder)
        .limit(limit)
        .offset(offset)

  const ticketIds = ticketsRows.map((r) => r.ticket.id)

  const [assigneesRows, checklistRows, tagsRows, repliesRows, attachmentsRows] =
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
            .select({ ticketId: ticketComments.ticketId, createdAt: ticketComments.receivedAt })
            .from(ticketComments)
            .where(
              and(
                inArray(ticketComments.ticketId, ticketIds),
                // Customer: agent/automation replies. Staff: notes or customer replies.
                isCustomerViewer
                  ? and(
                      eq(ticketComments.visibility, 'reply'),
                      or(
                        isNull(ticketComments.authorType),
                        ne(ticketComments.authorType, 'customer')
                      )
                    )
                  : or(
                      eq(ticketComments.visibility, 'note'),
                      and(
                        eq(ticketComments.visibility, 'reply'),
                        eq(ticketComments.authorType, 'customer')
                      )
                    )
              )
            ),
          db
            .select({
              ticketId: ticketAttachments.ticketId,
              id: ticketAttachments.id,
              fileUrl: ticketAttachments.fileUrl,
              fileName: ticketAttachments.fileName,
              filePath: ticketAttachments.filePath,
            })
            .from(ticketAttachments)
            .where(inArray(ticketAttachments.ticketId, ticketIds))
            .orderBy(asc(ticketAttachments.createdAt)),
        ])
      : [[], [], [], [], []]

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

  const attachmentsByTicket: Record<
    number,
    Array<{ id: string; file_url: string; file_name: string; file_path: string }>
  > = {}
  attachmentsRows.forEach((row) => {
    if (!attachmentsByTicket[row.ticketId]) attachmentsByTicket[row.ticketId] = []
    attachmentsByTicket[row.ticketId].push({
      id: row.id,
      file_url: row.fileUrl || (row.filePath ? getPublicUrl(row.filePath) : ''),
      file_name: row.fileName,
      file_path: row.filePath ?? '',
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

  // When a person last did something on the ticket (staff only; customers would see internal activity timing).
  const lastActivity = isCustomerViewer
    ? new Map<number, string>()
    : await getLastActivity(ticketsRows.map((r) => ({ id: r.ticket.id, createdAt: r.ticket.createdAt })))

  const result = ticketsRows.map((r) => {
    const t = r.ticket
    const cl = checklistByTicket[t.id] || { completed: 0, total: 0, items: [] }
    const audienceLastRead = isCustomerViewer ? t.customerLastReadAt : t.staffLastReadAt
    const lastReadAt = audienceLastRead ? new Date(audienceLastRead).toISOString() : null
    const latestReplyAt = latestReplies[t.id]
    // For agents: a ticket created by a customer counts as unread until first opened.
    // Use dbInsertedAt as fallback when there are no comments yet.
    const creatorIsCustomer = !isCustomerViewer && r.creator?.role?.toLowerCase() === 'customer'
    const ticketInsertedAt = t.dbInsertedAt ? new Date(t.dbInsertedAt).toISOString() : null
    const latestActivityAt = latestReplyAt ?? (creatorIsCustomer ? ticketInsertedAt : null)
    const hasUnread = !!latestActivityAt && (!lastReadAt || latestActivityAt > lastReadAt)
    const creatorName = r.creator?.fullName || r.creator?.email || 'Unknown'
    const companyName = r.company?.name

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      short_note: t.shortNote ?? null,
      created_by: t.createdBy,
      merged_into_ticket_id: t.mergedIntoTicketId ?? null,
      contact_user_id: t.contactUserId ?? null,
      due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      status: t.status,
      team_id: t.teamId,
      type_id: t.typeId,
      ticket_type: coerceTicketType(t.ticketType),
      priority: t.priority,
      company_id: t.companyId,
      created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
      updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
      last_activity_at: lastActivity.get(t.id) ?? null,
      creator: r.creator
        ? { id: r.creator.id, full_name: r.creator.fullName, email: r.creator.email }
        : null,
      team: r.team ? { id: r.team.id, name: r.team.name } : null,
      type: r.type ? { id: r.type.id, title: r.type.title, slug: r.type.slug, color: r.type.color } : null,
      company: r.company
        ? { id: r.company.id, name: r.company.name, color: r.company.color, email: r.company.email, display_order: r.company.displayOrder ?? null }
        : null,
      creator_name: creatorName,
      by_label: creatorName || companyName,
      team_name: r.team?.name ?? null,
      tags: tagsByTicket[t.id] || [],
      assignees: assigneesByTicket[t.id] || [],
      checklist_items: cl.items,
      checklist_completed: cl.completed,
      checklist_total: cl.total,
      last_read_at: lastReadAt,
      has_unread_replies: hasUnread,
      attachments: attachmentsByTicket[t.id] || [],
    }
  })

  if (paginated) {
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(whereClause)
    const total = countResult[0]?.count ?? 0
    return NextResponse.json({ data: result, total })
  }

  return NextResponse.json(result)
}

/** POST /api/tickets - Create ticket */
export async function POST(request: Request) {
  return createTicket(request, await auth())
}

