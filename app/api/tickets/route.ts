import { and, asc, desc, eq, gte, ilike, inArray, lte,or } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { db } from '@/lib/db'
import {
  companies,
  companyUsers,
  emailIntegrations,
  messageTemplates,
  tags,
  teamMembers,
  teams,
  ticketAssignees,
  ticketAttachments,
  ticketChecklist,
  ticketComments,
  ticketPriorities,
  tickets,
  ticketTags,
  ticketTypes,
  users,
} from '@/lib/db'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'
import { notifySlackTicketEvent } from '@/lib/slack-ticket-notify'
import { getPublicUrl } from '@/lib/storage-idrive'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { coerceTicketType, DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000
const REQUESTER_NEW_TICKET_TEMPLATE_KEY = 'requester_notification_new_ticket_created' as const

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

async function sendRequesterTicketCreatedEmail(params: {
  creatorUserId: string
  creatorRole: string | null | undefined
  companyId: string | null
  ticketId: number
  ticketTitle: string
}) {
  const { creatorUserId, creatorRole, companyId, ticketId, ticketTitle } = params
  const [creatorUser] = await db.select().from(users).where(eq(users.id, creatorUserId)).limit(1)
  const creatorRoleLower = (creatorRole || '').toLowerCase()

  const recipientEntries: Array<{
    email: string
    user: typeof users.$inferSelect | null
  }> = []
  const seenEmails = new Set<string>()
  const pushRecipient = (emailRaw: string | null | undefined, user: typeof users.$inferSelect | null) => {
    const email = String(emailRaw || '').trim().toLowerCase()
    if (!email || seenEmails.has(email)) return
    seenEmails.add(email)
    recipientEntries.push({ email, user })
  }

  if (creatorRoleLower === 'customer') {
    pushRecipient(creatorUser?.email, creatorUser ?? null)
  } else if (companyId) {
    // Agent-created ticket on a company: notify only one company leader (company_admin).
    const [leaderRow] = await db
      .select({ user: users, joinedAt: companyUsers.createdAt })
      .from(companyUsers)
      .leftJoin(users, eq(companyUsers.userId, users.id))
      .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.companyRole, 'company_admin')))
      .orderBy(asc(companyUsers.createdAt))
      .limit(1)
    pushRecipient(leaderRow?.user?.email, leaderRow?.user ?? null)
  } else {
    pushRecipient(creatorUser?.email, creatorUser ?? null)
  }

  if (recipientEntries.length === 0) return

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return

  const [integration] = await db
    .select({
      id: emailIntegrations.id,
      emailAddress: emailIntegrations.emailAddress,
      accessToken: emailIntegrations.accessToken,
      refreshToken: emailIntegrations.refreshToken,
      expiresAt: emailIntegrations.expiresAt,
    })
    .from(emailIntegrations)
    .where(and(eq(emailIntegrations.provider, 'google'), eq(emailIntegrations.isActive, true)))
    .limit(1)

  if (!integration?.accessToken) return

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl}/api/email/google/callback`
  )

  let accessToken = integration.accessToken
  const expiresAt = integration.expiresAt ? new Date(integration.expiresAt) : null
  const needsRefresh = !expiresAt || expiresAt <= new Date()
  if (needsRefresh && integration.refreshToken) {
    oauth2Client.setCredentials({ refresh_token: integration.refreshToken })
    const { credentials } = await oauth2Client.refreshAccessToken()
    accessToken = credentials.access_token ?? integration.accessToken
    if (credentials.access_token && credentials.expiry_date) {
      await db
        .update(emailIntegrations)
        .set({
          accessToken: credentials.access_token,
          expiresAt: new Date(credentials.expiry_date),
          updatedAt: new Date(),
        })
        .where(eq(emailIntegrations.id, integration.id))
    }
  } else {
    oauth2Client.setCredentials({ access_token: accessToken })
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const fromEmail = integration.emailAddress || 'noreply@example.com'
  const safeBase = baseUrl.replace(/\/$/, '')
  const ticketUrl = `${safeBase}/tickets/${ticketId}`

  const [tpl] = await db
    .select({ content: messageTemplates.content })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.key, REQUESTER_NEW_TICKET_TEMPLATE_KEY),
        eq(messageTemplates.status, 'active')
      )
    )
    .limit(1)

  const senderMap = userRowToMergeMap(creatorUser ?? null)
  const rawTpl = tpl?.content?.trim() ?? ''
  const subject = `Ticket #${ticketId} has been created`
  const subjectMime = encodeSubjectHeader(subject)

  for (const recipient of recipientEntries) {
    const recipientMap = userRowToMergeMap(recipient.user)
    const mergedTpl = rawTpl
      ? mergeMessageTemplateHtml(rawTpl, {
          origin: safeBase,
          ticketId: String(ticketId),
          recipient: recipientMap,
          sender: senderMap,
          useDomMerge: false,
        })
      : ''

    const fallbackHtml =
      `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
      `<p>Your ticket has been created successfully.</p>` +
      `<p><strong>Ticket #${ticketId}</strong>: ${ticketTitle}</p>` +
      `<p>You can view your ticket here: <a href="${ticketUrl}">${ticketUrl}</a></p>`

    const bodyHtml = mergedTpl || fallbackHtml
    const rawEmail = [
      `From: ${fromEmail}`,
      `To: ${recipient.email}`,
      `Subject: ${subjectMime}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      bodyHtml,
    ].join('\r\n')

    const raw = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })
  }
}

/** GET /api/tickets - List tickets with related data (server-side filtering). Customer: only tickets of their company */
export async function GET(request: Request) {
  const session = await auth()
  const authUser = session?.user
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = authUser.id
  const role = (authUser as { role?: string }).role?.toLowerCase()

  // Customer: only tickets for the same company
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
  const priorityIdsParam = url.searchParams.get('priority_ids')
  const priorityIds = priorityIdsParam
    ? priorityIdsParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    : []
  const teamIds = teamIdsParam
    ? teamIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : teamIdParam
      ? [teamIdParam.trim()]
      : []
  const ticketTypeFilter = url.searchParams.get('ticket_type')?.trim().toLowerCase()

  /**
   * Visibility access (agent/manager, dll.): user can only see tickets they have access to.
   * - public: everyone
   * - private: only creator
   * - specific_users: only assignees (filter shows as "Private")
   * - team: only members of ticket's team (ticket must have team_id)
   *
   * Admin: no visibility gate on list (still optional company / visibility sidebar filters).
   * Customer: see every ticket for their company (no visibility gate on list).
   */
  const visibilityAccess = or(
    eq(tickets.visibility, 'public'),
    and(eq(tickets.visibility, 'private'), eq(tickets.createdBy, userId)),
    sql`(${tickets.visibility} = 'specific_users' AND ${tickets.id} IN (SELECT ticket_id FROM ticket_assignees WHERE user_id = ${userId}))`,
    sql`(${tickets.visibility} = 'team' AND ${tickets.teamId} IN (SELECT team_id FROM team_members WHERE user_id = ${userId}))`
  )!

  const isCustomerList =
    role === 'customer' && forcedCompanyIds.length > 0
  const isAdminList = isAdmin(role as string | undefined)

  /** When filter visibility=private (or old specific_users), include both - Private filter shows tickets for creator/assignees */
  let visibilityFilterValues = visibilityValues
  if (visibilityValues.includes('private') || visibilityValues.includes('specific_users')) {
    visibilityFilterValues = visibilityFilterValues.filter((v) => v !== 'private' && v !== 'specific_users')
    if (!visibilityFilterValues.includes('specific_users')) visibilityFilterValues.push('specific_users')
    if (!visibilityFilterValues.includes('private')) visibilityFilterValues.push('private')
  }

  const conditions: ReturnType<typeof eq>[] = []
  if (isCustomerList) {
    conditions.push(inArray(tickets.companyId, forcedCompanyIds))
  } else if (isAdminList) {
    if (companyIds.length > 0) conditions.push(inArray(tickets.companyId, companyIds))
  } else {
    conditions.push(visibilityAccess)
    if (companyIds.length > 0) conditions.push(inArray(tickets.companyId, companyIds))
  }
  if (statusSlugs.length > 0) conditions.push(inArray(tickets.status, statusSlugs))
  if (typeIds.length > 0) conditions.push(inArray(tickets.typeId, typeIds))
  if (priorityIds.length > 0) conditions.push(inArray(tickets.priorityId, priorityIds))
  /**
   * Customers never see spam/trash lists (ignore `ticket_type` query).
   * Staff: junk folders via explicit `?ticket_type=spam|trash`; else main list = `support` only.
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
      due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
      status: t.status,
      visibility: t.visibility,
      team_id: t.teamId,
      type_id: t.typeId,
      ticket_type: coerceTicketType(t.ticketType),
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

  const userId = authUser.id
  const role = (authUser as { role?: string }).role?.toLowerCase()
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
      status: status || 'open',
      visibility: visibility || 'private',
      teamId: team_id || null,
      typeId: type_id ?? null,
      priorityId: priority_id ?? null,
      companyId: resolvedCompanyId,
      dueDate: due_date ? new Date(due_date) : null,
      createdBy: authUser.id,
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
    const ctx = await loadAutomationTicketContext(newTicket.id)
    if (ctx) await runAutomationRules('ticket_created', ctx)
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
        uploadedBy: authUser.id,
      }))
    )
  }

  const activityRole = role === 'customer' ? 'customer' : 'agent'
  await logTicketActivity({
    ticketId: newTicket.id,
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
        ticketId: newTicket.id,
        ticketTitle: newTicket.title,
        type: 'new_ticket_assignee',
        title: 'New ticket assignment',
        body: `You were assigned to "${newTicket.title}"`,
        actorUserId: userId,
        actorName,
        actorRole: role ?? null,
      })
    } catch (e) {
      console.error('[POST ticket] notify assignees:', e)
    }
  }

  void notifySlackTicketEvent('ticket_created', {
    id: newTicket.id,
    title: newTicket.title,
    status: newTicket.status,
    teamId: newTicket.teamId ?? null,
    priorityId: newTicket.priorityId ?? null,
    companyId: newTicket.companyId ?? null,
    typeId: newTicket.typeId ?? null,
  })

  try {
    await sendRequesterTicketCreatedEmail({
      creatorUserId: userId,
      creatorRole: role,
      companyId: resolvedCompanyId,
      ticketId: newTicket.id,
      ticketTitle: newTicket.title || 'Untitled',
    })
  } catch (mailErr) {
    console.error('[POST ticket] requester notification email failed:', mailErr)
  }

  return NextResponse.json({
    id: newTicket.id,
    created_at: newTicket.createdAt ? new Date(newTicket.createdAt).toISOString() : '',
    updated_at: newTicket.updatedAt ? new Date(newTicket.updatedAt).toISOString() : '',
  })
}
