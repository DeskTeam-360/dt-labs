/**
 * Server-side helper to fetch full ticket detail for detail page
 * Replaces Supabase queries
 */
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { customerCanAccessTicket } from '@/lib/customer-ticket-access'
import { db } from '@/lib/db'
import {
  commentAttachments,
  companies,
  projects,
  projectStatuses,
  screenshots,
  tags,
  teams,
  ticketAssignees,
  ticketAttributs,
  ticketCcRecipients,
  ticketChecklist,
  ticketComments,
  tickets,
  ticketTags,
  ticketTypes,
  users,
} from '@/lib/db'
import { getPublicUrl } from '@/lib/storage-idrive'
import { mapChecklistItemToDto } from '@/lib/ticket-checklist-map'
import { coerceTicketType } from '@/lib/ticket-classification'

const ticketCreator = alias(users, 'ticket_creator')
const ticketContactUser = alias(users, 'ticket_contact_user')

/** Initial / per-page comment batch size (newest-first window; UI shows oldest-at-top within batch). */
export const TICKET_COMMENTS_PAGE_SIZE = 10

export type TicketCommentOlderCursor = { created_at: string; id: string }

export interface TicketDetailOptions {
  /** @deprecated Prefer customerPortal */
  companyId?: string
  /** Portal customer: company tickets + personal tickets without company */
  customerPortal?: { userId: string; companyId: string | null }
  /** Filter screenshots by user (both admin and customer show only current user's) */
  screenshotUserId?: string
}

type CommentRowJoined = {
  comment: (typeof ticketComments.$inferSelect)
  user: typeof users.$inferSelect | null
}

function isCustomerPortalView(options?: TicketDetailOptions): boolean {
  return !!(options?.customerPortal || options?.companyId)
}

function commentsBaseWhere(ticketId: number, options?: TicketDetailOptions) {
  const ticketScope = eq(ticketComments.ticketId, ticketId)
  if (isCustomerPortalView(options)) {
    return and(
      ticketScope,
      or(isNull(ticketComments.visibility), ne(ticketComments.visibility, 'note'))
    )!
  }
  return ticketScope
}

async function mapCommentRowsToClient(rows: CommentRowJoined[]) {
  if (rows.length === 0) return []

  const commentIds = rows.map((r) => r.comment.id)
  const allTaggedIds = [...new Set(rows.flatMap((r) => r.comment.taggedUserIds ?? []))]
  const taggedUserRows =
    allTaggedIds.length > 0
      ? await db
          .select({ id: users.id, fullName: users.fullName, email: users.email })
          .from(users)
          .where(inArray(users.id, allTaggedIds))
      : []
  const taggedUserById: Record<string, { id: string; full_name: string | null; email: string }> = {}
  for (const u of taggedUserRows) {
    taggedUserById[u.id] = { id: u.id, full_name: u.fullName, email: u.email }
  }

  const commentAttachRows =
    commentIds.length > 0
      ? await db
          .select()
          .from(commentAttachments)
          .where(inArray(commentAttachments.commentId, commentIds))
      : []

  const commentAttachByCommentId: Record<string, Array<{ id: string; file_url: string; file_name: string }>> = {}
  for (const row of commentAttachRows) {
    if (!commentAttachByCommentId[row.commentId]) {
      commentAttachByCommentId[row.commentId] = []
    }
    commentAttachByCommentId[row.commentId].push({
      id: row.id,
      file_url: row.fileUrl || (row.filePath ? getPublicUrl(row.filePath) : ''),
      file_name: row.fileName,
    })
  }

  return rows.map((r) => ({
    id: r.comment.id,
    ticket_id: r.comment.ticketId,
    user_id: r.comment.userId,
    comment: r.comment.comment,
    created_at: r.comment.createdAt ? new Date(r.comment.createdAt).toISOString() : '',
    visibility: r.comment.visibility ?? 'reply',
    author_type: r.comment.authorType ?? 'agent',
    tagged_user_ids: r.comment.taggedUserIds ?? [],
    tagged_users: (r.comment.taggedUserIds ?? []).flatMap((id) => {
      const u = taggedUserById[id]
      return u ? [u] : []
    }),
    cc_emails: r.comment.ccEmails ?? [],
    bcc_emails: r.comment.bccEmails ?? [],
    user: r.user
      ? { id: r.user.id, full_name: r.user.fullName, email: r.user.email, avatar_url: r.user.avatarUrl }
      : null,
    comment_attachments: commentAttachByCommentId[r.comment.id] || [],
  }))
}

/**
 * Fetch a window of comments: `latest` = newest N; `older` = N comments strictly before cursor (chronological).
 */
export async function fetchTicketCommentsWindow(
  ticketId: number,
  options: TicketDetailOptions | undefined,
  mode: 'latest' | 'older',
  olderThan: TicketCommentOlderCursor | null,
  pageSize: number = TICKET_COMMENTS_PAGE_SIZE
) {
  const base = commentsBaseWhere(ticketId, options)
  let whereClause = base
  if (mode === 'older' && olderThan) {
    const d = new Date(olderThan.created_at)
    const beforeId = olderThan.id
    whereClause = and(
      base,
      or(lt(ticketComments.createdAt, d), and(eq(ticketComments.createdAt, d), sql`${ticketComments.id}::text < ${beforeId}`))
    )!
  }

  const descRows = await db
    .select({
      comment: ticketComments,
      user: users,
    })
    .from(ticketComments)
    .leftJoin(users, eq(ticketComments.userId, users.id))
    .where(whereClause)
    .orderBy(desc(ticketComments.createdAt), desc(ticketComments.id))
    .limit(pageSize + 1)

  const hasOlder = descRows.length > pageSize
  const batch = hasOlder ? descRows.slice(0, pageSize) : descRows
  const chronological: CommentRowJoined[] = [...batch].reverse()

  const comments = await mapCommentRowsToClient(chronological)

  const oldest = batch.length > 0 ? batch[batch.length - 1]!.comment : null
  const comments_older_cursor: TicketCommentOlderCursor | null =
    hasOlder && oldest
      ? {
          created_at: oldest.createdAt ? new Date(oldest.createdAt).toISOString() : '',
          id: oldest.id,
        }
      : null

  let comments_older_remaining = 0
  if (hasOlder && oldest) {
    const d = oldest.createdAt ? new Date(oldest.createdAt) : new Date(0)
    const beforeId = oldest.id
    const olderThanBase = and(
      base,
      or(
        lt(ticketComments.createdAt, d),
        and(eq(ticketComments.createdAt, d), sql`${ticketComments.id}::text < ${beforeId}`)
      )!
    )!
    const [cntRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(ticketComments)
      .where(olderThanBase)
    comments_older_remaining = Number(cntRow?.c ?? 0)
  }

  return { comments, comments_has_older: hasOlder, comments_older_cursor, comments_older_remaining }
}

export async function getTicketDetail(ticketId: number, options?: TicketDetailOptions) {
  const [ticketRow] = await db
    .select({
      ticket: tickets,
      creator: ticketCreator,
      contact: ticketContactUser,
      team: teams,
      type: ticketTypes,
      company: companies,
      project: projects,
    })
    .from(tickets)
    .leftJoin(ticketCreator, eq(tickets.createdBy, ticketCreator.id))
    .leftJoin(ticketContactUser, eq(tickets.contactUserId, ticketContactUser.id))
    .leftJoin(teams, eq(tickets.teamId, teams.id))
    .leftJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
    .leftJoin(companies, eq(tickets.companyId, companies.id))
    .leftJoin(projects, eq(tickets.projectId, projects.id))
    .where(eq(tickets.id, ticketId))

  if (!ticketRow?.ticket) return null

  const t = ticketRow.ticket
  if (options?.customerPortal) {
    const { userId, companyId } = options.customerPortal
    if (!customerCanAccessTicket(
      { companyId: t.companyId, contactUserId: t.contactUserId, createdBy: t.createdBy },
      userId,
      companyId
    )) {
      return null
    }
    const cls = coerceTicketType(t.ticketType)
    if (cls === 'spam' || cls === 'trash' || cls === 'project') return null
  } else if (options?.companyId && t.companyId !== options.companyId) {
    return null
  } else if (options?.companyId) {
    const cls = coerceTicketType(t.ticketType)
    if (cls === 'spam' || cls === 'trash' || cls === 'project') return null
  }

  const [assigneesRows, checklistRows, attributsRows, screenshotsRows, ticketTagsRows, ccRecipientsRows] =
    await Promise.all([
      db
        .select({
          id: ticketAssignees.id,
          userId: ticketAssignees.userId,
          user: users,
        })
        .from(ticketAssignees)
        .leftJoin(users, eq(ticketAssignees.userId, users.id))
        .where(eq(ticketAssignees.ticketId, ticketId)),
      (async () => {
        try {
          return await db
            .select({
              item: ticketChecklist,
              completedBy: users,
            })
            .from(ticketChecklist)
            .leftJoin(users, eq(ticketChecklist.completedByUserId, users.id))
            .where(eq(ticketChecklist.ticketId, ticketId))
            .orderBy(asc(ticketChecklist.orderIndex))
        } catch {
          return []
        }
      })(),
      (async () => {
        try {
          return await db
            .select()
            .from(ticketAttributs)
            .where(eq(ticketAttributs.ticketId, ticketId))
            .orderBy(asc(ticketAttributs.metaKey))
        } catch {
          return []
        }
      })(),
      db
        .select()
        .from(screenshots)
        .where(
          options?.screenshotUserId
            ? and(eq(screenshots.ticketId, ticketId), eq(screenshots.userId, options.screenshotUserId))
            : eq(screenshots.ticketId, ticketId)
        )
        .orderBy(desc(screenshots.createdAt)),
      db
        .select({ tag: tags })
        .from(ticketTags)
        .leftJoin(tags, eq(ticketTags.tagId, tags.id))
        .where(eq(ticketTags.ticketId, ticketId)),
      (async () => {
        try {
          return await db
            .select({ email: ticketCcRecipients.email })
            .from(ticketCcRecipients)
            .where(eq(ticketCcRecipients.ticketId, ticketId))
        } catch {
          return []
        }
      })(),
    ])

  const {
    comments,
    comments_has_older,
    comments_older_cursor,
    comments_older_remaining,
  } = await fetchTicketCommentsWindow(ticketId, options, 'latest', null, TICKET_COMMENTS_PAGE_SIZE)

  const ticketTypeCls = coerceTicketType(t.ticketType)
  let project_status: { id: number; title: string; slug: string; color: string } | null = null
  let project_statuses: Array<{ id: number; title: string; slug: string; color: string; sort_order: number }> = []

  if (ticketTypeCls === 'project' && t.projectId) {
    const psRows = await db
      .select()
      .from(projectStatuses)
      .where(eq(projectStatuses.projectId, t.projectId))
      .orderBy(asc(projectStatuses.sortOrder))
    project_statuses = psRows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      color: r.color,
      sort_order: r.sortOrder,
    }))
    if (t.projectStatusId != null) {
      const cur = psRows.find((r) => r.id === t.projectStatusId)
      project_status = cur
        ? { id: cur.id, title: cur.title, slug: cur.slug, color: cur.color }
        : null
    }
  }

  const ticketData = {
    id: t.id,
    title: t.title,
    description: t.description,
    original_description: t.originalDescription ?? null,
    short_note: t.shortNote ?? null,
    created_by: t.createdBy,
    contact_user_id: t.contactUserId ?? null,
    due_date: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    status: t.status,
    visibility: t.visibility,
    team_id: t.teamId,
    type_id: t.typeId,
    ticket_type: ticketTypeCls,
    priority: t.priority ?? null,
    company_id: t.companyId,
    project_id: t.projectId ?? null,
    project_status_id: t.projectStatusId ?? null,
    project: ticketRow.project
      ? { id: ticketRow.project.id, title: ticketRow.project.title }
      : null,
    project_status,
    project_statuses,
    created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
    updated_at: t.updatedAt ? new Date(t.updatedAt).toISOString() : '',
    gmail_thread_id: t.gmailThreadId,
    created_via: t.createdVia,
    last_read_at: (() => {
      const audienceLastRead = isCustomerPortalView(options)
        ? t.customerLastReadAt
        : t.staffLastReadAt
      return audienceLastRead ? new Date(audienceLastRead).toISOString() : null
    })(),
    creator: ticketRow.creator
      ? {
          id: ticketRow.creator.id,
          full_name: ticketRow.creator.fullName,
          email: ticketRow.creator.email,
          avatar_url: ticketRow.creator.avatarUrl ?? null,
        }
      : null,
    contact: ticketRow.contact
      ? {
          id: ticketRow.contact.id,
          full_name: ticketRow.contact.fullName,
          email: ticketRow.contact.email,
          avatar_url: ticketRow.contact.avatarUrl ?? null,
        }
      : null,
    team: ticketRow.team ? { id: ticketRow.team.id, name: ticketRow.team.name } : null,
    type: ticketRow.type
      ? { id: ticketRow.type.id, title: ticketRow.type.title, slug: ticketRow.type.slug, color: ticketRow.type.color }
      : null,
    company: ticketRow.company
      ? {
          id: ticketRow.company.id,
          name: ticketRow.company.name,
          color: ticketRow.company.color,
          email: ticketRow.company.email,
        }
      : null,
    assignees: assigneesRows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      user: r.user
        ? {
            id: r.user.id,
            full_name: r.user.fullName,
            email: r.user.email,
            avatar_url: r.user.avatarUrl,
          }
        : null,
    })),
  }

  const checklistItems = checklistRows.map((r) =>
    mapChecklistItemToDto(r.item, r.completedBy ?? undefined)
  )

  const attributes = attributsRows.map((r) => ({
    id: r.id,
    ticket_id: r.ticketId,
    meta_key: r.metaKey,
    meta_value: r.metaValue,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  const tagsList = ticketTagsRows
    .map((r) => r.tag)
    .filter(Boolean)
    .map((tag) => ({
      id: tag!.id,
      name: tag!.name,
      slug: tag!.slug,
      color: tag!.color ?? undefined,
    }))

  const screenshotsList = screenshotsRows.map((r) => ({
    id: r.id,
    file_name: r.fileName,
    file_path: r.filePath,
    file_url: r.fileUrl || (r.filePath ? getPublicUrl(r.filePath) : ''),
    file_size: r.fileSize ?? 0,
    mime_type: r.mimeType ?? '',
    ticket_id: r.ticketId,
    title: r.title,
    description: r.description,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  const ticketCcEmails = Array.isArray(ccRecipientsRows) ? ccRecipientsRows.map((r) => r.email).filter(Boolean) : []

  return {
    ticketData,
    checklistItems,
    comments,
    comments_has_older,
    comments_older_cursor,
    comments_older_remaining,
    attributes,
    screenshots: screenshotsList,
    tags: tagsList,
    ticketCcEmails,
  }
}
