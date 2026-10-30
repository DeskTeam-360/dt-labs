import { and, asc, eq, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { getCustomerCompanyIds } from '@/lib/customer-company'
import { db } from '@/lib/db'
import { companies, projects, projectStatuses, ticketAssignees, ticketAttachments, tickets, ticketTags } from '@/lib/db'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { sendRequesterTicketCreatedEmail } from '@/lib/requester-new-ticket-email'
import { applyDefaultSkillsToTicket, setTicketSkills, validSkillIds } from '@/lib/skills'
import { notifySlackTicketEvent } from '@/lib/slack-ticket-notify'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'
import { assignCompanySupportTicketRank, assignCreatorSupportTicketRank, parseCompanyTicketDesiredRank } from '@/lib/ticket-company-priority-order'
import { assertTicketContactUserAllowed, getContactCompanyIds, getEffectiveCompanyIdForUser } from '@/lib/ticket-contact-user'
import { sendNewTicketAgentNotificationEmail } from '@/lib/ticket-notification-emails'
import type { TicketPatchSession } from '@/lib/ticket-patch'
import { assertCustomerMayUseTicketType } from '@/lib/ticket-type-customer-access'

/** Creates a ticket for the signed-in person or, through the API, for the owner of a key. Same code for both. */
export async function createTicket(request: Request, session: TicketPatchSession) {
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
  if (role === 'customer') {
    const allowedCompanyIds = await getCustomerCompanyIds(userId)
    if (resolvedCompanyId && !allowedCompanyIds.includes(resolvedCompanyId)) {
      return NextResponse.json({ error: 'You cannot create tickets for this company' }, { status: 403 })
    }
    resolvedCompanyId = resolvedCompanyId ?? allowedCompanyIds[0] ?? null
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
    const contactCompanyIds = await getContactCompanyIds(contactUserId)
    // A contact may belong to several companies; only realign when the chosen company isn't one of them.
    const contactCompany =
      resolvedCompanyId && contactCompanyIds.includes(resolvedCompanyId)
        ? resolvedCompanyId
        : await getEffectiveCompanyIdForUser(contactUserId)
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

  // Skills: the ones picked on the form, otherwise the company + ticket type defaults (pre-skills).
  try {
    // Skills are internal: only staff may pick them. Customer tickets always start from the defaults.
    const creatorIsStaff = ['admin', 'operations', 'manager', 'staff'].includes(String((authUser as { role?: string }).role ?? '').toLowerCase())
    if (creatorIsStaff && Array.isArray(body.skill_ids)) {
      const ids = await validSkillIds(body.skill_ids)
      await setTicketSkills(ticket.id, ids, body.primary_skill_id)
    } else {
      await applyDefaultSkillsToTicket(ticket.id, ticket.companyId, ticket.typeId)
    }
  } catch (skillErr) {
    console.error('Ticket skills error:', skillErr)
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
      const notifResult = await sendRequesterTicketCreatedEmail({
        creatorUserId: userId,
        creatorRole: role,
        companyId: resolvedCompanyId,
        ticketId: ticket.id,
        ticketTitle: ticket.title || 'Untitled',
      })
      // Persist the Gmail thread ID so customer email replies can be matched to this ticket.
      if (notifResult.sent && notifResult.sentThreadId && !ticket.gmailThreadId) {
        await db
          .update(tickets)
          .set({ gmailThreadId: notifResult.sentThreadId, updatedAt: new Date() })
          .where(eq(tickets.id, ticket.id))
      }
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

