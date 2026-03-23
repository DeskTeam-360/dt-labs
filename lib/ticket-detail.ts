/**
 * Server-side helper to fetch full ticket detail for detail page
 * Replaces Supabase queries
 */
import { db } from '@/lib/db'
import {
  tickets,
  users,
  teams,
  ticketTypes,
  ticketPriorities,
  companies,
  ticketAssignees,
  ticketChecklist,
  ticketComments,
  ticketCcRecipients,
  commentAttachments,
  ticketAttributs,
  screenshots,
  ticketTags,
  tags,
} from '@/lib/db'
import { eq, asc, inArray, and, desc } from 'drizzle-orm'
import { getPublicUrl } from '@/lib/storage-idrive'

export interface TicketDetailOptions {
  /** For customer: only show ticket if company_id matches */
  companyId?: string
  /** Filter screenshots by user (both admin and customer show only current user's) */
  screenshotUserId?: string
}

export async function getTicketDetail(ticketId: number, options?: TicketDetailOptions) {
  const [ticketRow] = await db
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
    .where(eq(tickets.id, ticketId))

  if (!ticketRow?.ticket) return null

  const t = ticketRow.ticket
  if (options?.companyId && t.companyId !== options.companyId) {
    return null
  }

  const [assigneesRows, checklistRows, commentsRows, attributsRows, screenshotsRows, ticketTagsRows, ccRecipientsRows] =
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
            .select()
            .from(ticketChecklist)
            .where(eq(ticketChecklist.ticketId, ticketId))
            .orderBy(asc(ticketChecklist.orderIndex))
        } catch {
          return []
        }
      })(),
      db
        .select({
          comment: ticketComments,
          user: users,
        })
        .from(ticketComments)
        .leftJoin(users, eq(ticketComments.userId, users.id))
        .where(eq(ticketComments.ticketId, ticketId))
        .orderBy(asc(ticketComments.createdAt)),
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

  // Get comment attachments for each comment
  const commentIds = commentsRows.map((r) => r.comment.id)
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

  const ticketData = {
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
    gmail_thread_id: t.gmailThreadId,
    created_via: t.createdVia,
    last_read_at: t.lastReadAt ? new Date(t.lastReadAt).toISOString() : null,
    creator: ticketRow.creator
      ? {
          id: ticketRow.creator.id,
          full_name: ticketRow.creator.fullName,
          email: ticketRow.creator.email,
        }
      : null,
    team: ticketRow.team ? { id: ticketRow.team.id, name: ticketRow.team.name } : null,
    type: ticketRow.type
      ? { id: ticketRow.type.id, title: ticketRow.type.title, slug: ticketRow.type.slug, color: ticketRow.type.color }
      : null,
    priority: ticketRow.priority
      ? {
          id: ticketRow.priority.id,
          title: ticketRow.priority.title,
          slug: ticketRow.priority.slug,
          color: ticketRow.priority.color,
        }
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

  const checklistItems = checklistRows.map((r) => ({
    id: r.id,
    ticket_id: r.ticketId,
    title: r.title,
    is_completed: r.isCompleted,
    order_index: r.orderIndex ?? 0,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
  }))

  const comments = commentsRows.map((r) => ({
    id: r.comment.id,
    ticket_id: r.comment.ticketId,
    user_id: r.comment.userId,
    comment: r.comment.comment,
    created_at: r.comment.createdAt ? new Date(r.comment.createdAt).toISOString() : '',
    visibility: r.comment.visibility ?? 'reply',
    author_type: r.comment.authorType ?? 'agent',
    tagged_user_ids: r.comment.taggedUserIds ?? [],
    cc_emails: r.comment.ccEmails ?? [],
    bcc_emails: r.comment.bccEmails ?? [],
    user: r.user
      ? { id: r.user.id, full_name: r.user.fullName, email: r.user.email, avatar_url: r.user.avatarUrl }
      : null,
    comment_attachments: commentAttachByCommentId[r.comment.id] || [],
  }))

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
    attributes,
    screenshots: screenshotsList,
    tags: tagsList,
    ticketCcEmails,
  }
}
