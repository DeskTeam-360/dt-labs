import { and, asc, eq, gte, ilike, inArray, isNotNull, lte, or, type SQL,sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { customerTicketsAccessCondition } from '@/lib/customer-ticket-access'
import { db } from '@/lib/db'
import {
  companies,
  companyUsers,
  projects,
  projectStatuses,
  tags,
  teams,
  ticketAssignees,
  ticketAttachments,
  ticketChecklist,
  ticketComments,
  tickets,
  ticketTags,
  ticketTypes,
  users,
} from '@/lib/db'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { sendRequesterTicketCreatedEmail } from '@/lib/requester-new-ticket-email'
import { notifySlackTicketEvent } from '@/lib/slack-ticket-notify'
import { getPublicUrl } from '@/lib/storage-idrive'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { coerceTicketType, DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import {
  assignCompanySupportTicketRank,
  assignCreatorSupportTicketRank,
  parseCompanyTicketDesiredRank,
} from '@/lib/ticket-company-priority-order'
import {
  assertTicketContactUserAllowed,
  getEffectiveCompanyIdForUser,
} from '@/lib/ticket-contact-user'
import { sendNewTicketAgentNotificationEmail } from '@/lib/ticket-notification-emails'
import { assertCustomerMayUseTicketType } from '@/lib/ticket-type-customer-access'

const DEFAULT_LIMIT = 50
/** Max tickets per list request (UI: 50 / 100 / 200). */
const MAX_LIMIT = 200
/** GET /api/tickets - List tickets with related data (server-side filtering). Customer: only tickets of their company */
export async function GET(request: Request) {
  const session = await auth()
  const authUser = session?.user
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = authUser.id
  const role = (authUser as { role?: string }).role?.toLowerCase()

  // Customer: company tickets + personal tickets without company (owner)
  let customerCompanyId: string | null = null
  if (role === 'customer') {
    customerCompanyId = await getCustomerCompanyId(userId)
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
  const visibilityParam = url.searchParams.get('visibility')
  const teamIdParam = url.searchParams.get('team_id')
  const teamIdsParam = url.searchParams.get('team_ids')
  const dateFrom = url.searchParams.get('date_from')
  const dateTo = url.searchParams.get('date_to')
  const dueDateFrom = url.searchParams.get('due_date_from')
  const dueDateTo = url.searchParams.get('due_date_to')
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
  const ticketTypeFilter = url.searchParams.get('ticket_type')?.trim().toLowerCase()

  /**
   * Visibility access (non-admin agents): private / team / specific_users tickets follow access rules.
   * Public tickets are always visible. The sidebar no longer filters by `visibility`; `team_ids` still returns
   * public tickets for that team even when the user is not a team member.
   */
  const visibilityAccess = or(
    eq(tickets.visibility, 'public'),
    and(eq(tickets.visibility, 'private'), eq(tickets.createdBy, userId)),
    sql`(${tickets.visibility} = 'specific_users' AND ${tickets.id} IN (SELECT ticket_id FROM ticket_assignees WHERE user_id = ${userId}))`,
    sql`(${tickets.visibility} = 'team' AND ${tickets.teamId} IN (SELECT team_id FROM team_members WHERE user_id = ${userId}))`
  )!

  const isCustomerList = role === 'customer'
  const isAdminList = isAdmin(role as string | undefined)

  /** When filter visibility=private (or old specific_users), include both - Private filter shows tickets for creator/assignees */
  let visibilityFilterValues = visibilityValues
  if (visibilityValues.includes('private') || visibilityValues.includes('specific_users')) {
    visibilityFilterValues = visibilityFilterValues.filter((v) => v !== 'private' && v !== 'specific_users')
    if (!visibilityFilterValues.includes('specific_users')) visibilityFilterValues.push('specific_users')
    if (!visibilityFilterValues.includes('private')) visibilityFilterValues.push('private')
  }

  const conditions: SQL[] = []
  if (isCustomerList) {
    conditions.push(customerTicketsAccessCondition(userId, customerCompanyId))
  } else if (isAdminList) {
    if (companyIds.length > 0) conditions.push(inArray(tickets.companyId, companyIds))
  } else {
    conditions.push(visibilityAccess)
    if (companyIds.length > 0) conditions.push(inArray(tickets.companyId, companyIds))
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
    if (visibilityFilterValues.length > 0) conditions.push(inArray(tickets.visibility, visibilityFilterValues))
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
        .orderBy(asc(tickets.companyId), asc(tickets.priority), asc(tickets.id))
        .limit(limit)
        .offset(offset)
    : await baseQuery
        .orderBy(asc(tickets.companyId), asc(tickets.priority), asc(tickets.id))
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
            .select({ ticketId: ticketComments.ticketId, createdAt: ticketComments.createdAt })
            .from(ticketComments)
            .where(and(eq(ticketComments.visibility, 'reply'), inArray(ticketComments.ticketId, ticketIds))),
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
      contact_user_id: t.contactUserId ?? null,
      due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      status: t.status,
      visibility: t.visibility,
      team_id: t.teamId,
      type_id: t.typeId,
      ticket_type: coerceTicketType(t.ticketType),
      priority: t.priority,
      company_id: t.companyId,
      created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
      updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
      creator: r.creator
        ? { id: r.creator.id, full_name: r.creator.fullName, email: r.creator.email }
        : null,
      team: r.team ? { id: r.team.id, name: r.team.name } : null,
      type: r.type ? { id: r.type.id, title: r.type.title, slug: r.type.slug, color: r.type.color } : null,
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
      attachments: attachmentsByTicket[t.id] || [],
    }
  })

  return NextResponse.json(result)
}

/** POST /api/tickets - Create ticket */
export async function POST(request: Request) {
  const session = await auth()
  const authUser = session?.user
  if (!authUser?.id) {
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
    priority,
    company_id,
    due_date,
    assignees = [],
    tag_ids = [],
    attachments = [],
    created_via: bodyCreatedVia,
    contact_user_id: bodyContactUserId,
    project_id: bodyProjectId,
    project_status_id: bodyProjectStatusId,
  } = body

  const resolvedInsertVisibility =
    visibility !== undefined && visibility !== null && String(visibility).trim() !== ''
      ? String(visibility).trim()
      : 'public'

  /** created_via: 'portal' (admin app) | 'website' (embed/widget) | 'app' (mobile/external) - for automation conditions */
  const createdVia = bodyCreatedVia || 'portal'

  const userId = authUser.id
  const role = (authUser as { role?: string }).role?.toLowerCase()
  const numericPriorityRaw = priority !== undefined && priority !== null ? Number(priority) : 0
  const resolvedPriority =
    Number.isFinite(numericPriorityRaw) && !Number.isNaN(numericPriorityRaw)
      ? Math.max(0, Math.floor(numericPriorityRaw))
      : 0
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

  let contactUserId: string | null = null
  if (bodyContactUserId !== undefined && bodyContactUserId !== null && bodyContactUserId !== '') {
    if (typeof bodyContactUserId !== 'string') {
      return NextResponse.json({ error: 'contact_user_id must be a UUID string' }, { status: 400 })
    }
    contactUserId = bodyContactUserId
  }
  const contactCheck = await assertTicketContactUserAllowed(contactUserId)
  if (!contactCheck.ok) {
    return NextResponse.json({ error: contactCheck.error }, { status: 400 })
  }

  const companyIdBeforeContactAlign = resolvedCompanyId
  let ticketCrossCompanyWarning: string | undefined
  if (contactUserId) {
    const contactCompany = await getEffectiveCompanyIdForUser(contactUserId)
    if (contactCompany && contactCompany !== resolvedCompanyId) {
      if (companyIdBeforeContactAlign && companyIdBeforeContactAlign !== contactCompany) {
        ticketCrossCompanyWarning =
          "Contact is from another company: ticket company was aligned to the contact's company."
      }
      resolvedCompanyId = contactCompany
    }
  }

  let insertTicketType: 'support' | 'project' = 'support'
  let insertProjectId: string | null = null
  let insertProjectStatusId: number | null = null

  const rawProjectId =
    bodyProjectId != null && String(bodyProjectId).trim() !== '' ? String(bodyProjectId).trim() : null
  if (rawProjectId) {
    if (role === 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const [projRow] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, rawProjectId))
      .limit(1)
    if (!projRow) {
      return NextResponse.json({ error: 'Project not found' }, { status: 400 })
    }
    insertProjectId = projRow.id
    insertTicketType = 'project'

    const psParsed =
      bodyProjectStatusId != null && bodyProjectStatusId !== ''
        ? parseInt(String(bodyProjectStatusId), 10)
        : NaN
    if (Number.isFinite(psParsed)) {
      const [psRow] = await db
        .select({ id: projectStatuses.id })
        .from(projectStatuses)
        .where(and(eq(projectStatuses.id, psParsed), eq(projectStatuses.projectId, insertProjectId)))
        .limit(1)
      if (!psRow) {
        return NextResponse.json({ error: 'Invalid project_status_id' }, { status: 400 })
      }
      insertProjectStatusId = psRow.id
    } else {
      const [firstPs] = await db
        .select({ id: projectStatuses.id })
        .from(projectStatuses)
        .where(eq(projectStatuses.projectId, insertProjectId))
        .orderBy(asc(projectStatuses.sortOrder), asc(projectStatuses.id))
        .limit(1)
      insertProjectStatusId = firstPs?.id ?? null
    }
  }

  if (role === 'customer') {
    const typeCheck = await assertCustomerMayUseTicketType(type_id ?? null)
    if (!typeCheck.ok) {
      return NextResponse.json({ error: typeCheck.error }, { status: 400 })
    }
  }

  const useCompanyPriorityPool =
    insertTicketType === DEFAULT_TICKET_TYPE && resolvedCompanyId != null
  const useCreatorPriorityPool =
    insertTicketType === DEFAULT_TICKET_TYPE && !resolvedCompanyId && Boolean(authUser.id)

  let newTicket: typeof tickets.$inferSelect | undefined

  if (useCompanyPriorityPool) {
    const desiredRank = parseCompanyTicketDesiredRank(priority)
    try {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(tickets)
          .values({
            title: title || 'Untitled',
            description: description || null,
            shortNote: short_note ?? null,
            status: status || 'open',
            visibility: resolvedInsertVisibility,
            teamId: team_id || null,
            typeId: type_id ?? null,
            /** NULL first: UNIQUE (company_id, priority) for open support tickets would collide if we reused e.g. 1 before reorder. */
            priority: null,
            companyId: resolvedCompanyId,
            dueDate: due_date ? new Date(due_date) : null,
            createdBy: authUser.id,
            contactUserId,
            createdVia,
            ticketType: insertTicketType,
            projectId: insertProjectId,
            projectStatusId: insertProjectStatusId,
          })
          .returning()
        if (!row) throw new Error('Failed to create ticket')
        newTicket = row
        await assignCompanySupportTicketRank(tx, resolvedCompanyId!, row.id, desiredRank)
      })
    } catch (e) {
      console.error('[POST /api/tickets] company queue create failed:', e)
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
    }
  } else if (useCreatorPriorityPool) {
    const desiredRank = parseCompanyTicketDesiredRank(priority)
    try {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(tickets)
          .values({
            title: title || 'Untitled',
            description: description || null,
            shortNote: short_note ?? null,
            status: status || 'open',
            visibility: resolvedInsertVisibility,
            teamId: team_id || null,
            typeId: type_id ?? null,
            priority: null,
            companyId: null,
            dueDate: due_date ? new Date(due_date) : null,
            createdBy: authUser.id,
            contactUserId,
            createdVia,
            ticketType: insertTicketType,
            projectId: insertProjectId,
            projectStatusId: insertProjectStatusId,
          })
          .returning()
        if (!row) throw new Error('Failed to create ticket')
        newTicket = row
        await assignCreatorSupportTicketRank(tx, authUser.id, row.id, desiredRank)
      })
    } catch (e) {
      console.error('[POST /api/tickets] creator queue create failed:', e)
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
    }
  } else {
    const [row] = await db
      .insert(tickets)
      .values({
        title: title || 'Untitled',
        description: description || null,
        shortNote: short_note ?? null,
        status: status || 'open',
        visibility: resolvedInsertVisibility,
        teamId: team_id || null,
        typeId: type_id ?? null,
        priority: resolvedPriority,
        companyId: resolvedCompanyId,
        dueDate: due_date ? new Date(due_date) : null,
        createdBy: authUser.id,
        contactUserId,
        createdVia,
        ticketType: insertTicketType,
        projectId: insertProjectId,
        projectStatusId: insertProjectStatusId,
      })
      .returning()
    newTicket = row
  }

  if (!newTicket) {
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  }
  const ticket = newTicket

  if (assignees.length > 0) {
    await db.insert(ticketAssignees).values(
      assignees.map((userId: string) => ({
        ticketId: ticket.id,
        userId,
      }))
    )
  }

  if (tag_ids.length > 0) {
    await db.insert(ticketTags).values(
      tag_ids.map((tagId: string) => ({
        ticketId: ticket.id,
        tagId,
      }))
    )
  }

  try {
    const ctx = await loadAutomationTicketContext(ticket.id)
    if (ctx) await runAutomationRules('ticket_created', ctx)
  } catch (autoErr) {
    console.error('Automation rules error:', autoErr)
  }

  if (attachments.length > 0) {
    await db.insert(ticketAttachments).values(
      attachments.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        ticketId: ticket.id,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: authUser.id,
      }))
    )
  }

  const activityRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId: ticket.id,
    actorUserId: userId,
    actorRole: activityRole,
    action: 'ticket_created',
    metadata: {
      title: title || 'Untitled',
      created_via: createdVia,
      assignee_count: Array.isArray(assignees) ? assignees.length : 0,
      tag_count: Array.isArray(tag_ids) ? tag_ids.length : 0,
      attachment_count: Array.isArray(attachments) ? attachments.length : 0,
    },
  })

  if (Array.isArray(assignees) && assignees.length > 0) {
    try {
      const actorName = authUser.name || authUser.email || 'Someone'
      await notifyTicketUsers({
        recipientUserIds: assignees,
        excludeUserId: userId,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        type: 'new_ticket_assignee',
        title: 'New ticket assignment',
        body: `You were assigned to "${ticket.title}"`,
        actorUserId: userId,
        actorName,
        actorRole: role ?? null,
      })
    } catch (e) {
      console.error('[POST ticket] notify assignees:', e)
    }
  }

  if (insertTicketType !== 'project') {
    void notifySlackTicketEvent('ticket_created', {
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      teamId: ticket.teamId ?? null,
      priority: ticket.priority,
      companyId: ticket.companyId ?? null,
      typeId: ticket.typeId ?? null,
    })

    try {
      await sendRequesterTicketCreatedEmail({
        creatorUserId: userId,
        creatorRole: role,
        companyId: resolvedCompanyId,
        ticketId: ticket.id,
        ticketTitle: ticket.title || 'Untitled',
      })
    } catch (mailErr) {
      console.error('[POST ticket] requester notification email failed:', mailErr)
    }
    if (role === 'customer' && ticket.teamId) {
      try {
        await sendNewTicketAgentNotificationEmail({
          ticketId: ticket.id,
          ticketTitle: ticket.title || 'Untitled',
          teamId: ticket.teamId,
          creatorUserId: userId,
        })
      } catch (mailErr) {
        console.error('[POST ticket] agent new ticket notification email failed:', mailErr)
      }
    }
  }

  return NextResponse.json({
    id: ticket.id,
    created_at: ticket.createdAt ? new Date(ticket.createdAt).toISOString() : '',
    updated_at: ticket.updatedAt ? new Date(ticket.updatedAt).toISOString() : '',
    company_id: ticket.companyId ?? null,
    ...(ticketCrossCompanyWarning
      ? { ticket_cross_company_warning: ticketCrossCompanyWarning }
      : {}),
  })
}
