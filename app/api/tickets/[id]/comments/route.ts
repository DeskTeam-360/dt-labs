import bcrypt from 'bcryptjs'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { google } from 'googleapis'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { runTicketCommentAutomation } from '@/lib/automation-engine'
import {
  commentAttachments,
  companyUsers,
  db,
  emailIntegrations,
  messageTemplates,
  teamMembers,
  ticketAssignees,
  ticketCcRecipients,
  ticketComments,
  tickets,
  users,
} from '@/lib/db'
import { notifyTicketUsers } from '@/lib/firebase/ticket-notifications-server'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'
import { notifySlackTicketEvent } from '@/lib/slack-ticket-notify'
import { logTicketActivity } from '@/lib/ticket-activity-log'

const AGENT_REQUESTER_REPLIES_TEMPLATE_KEY = 'agent_notification_requester_replies' as const

function randomPassword(length = 24): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function truncateVarchar(s: string | null | undefined, maxLen: number): string {
  if (s == null || s === '') return ''
  const str = String(s).trim()
  return str.length <= maxLen ? str : str.slice(0, maxLen)
}

function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

async function sendAgentRequesterRepliesEmail(params: {
  ticketId: number
  actorUserId: string
  ticketTitle: string
  bodyPreview: string
}) {
  const { ticketId, actorUserId, ticketTitle, bodyPreview } = params

  const [ticketRow] = await db
    .select({ teamId: tickets.teamId })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)
  if (!ticketRow?.teamId) return

  const memberRows = await db
    .select({ user: users })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, ticketRow.teamId))

  const recipients = memberRows
    .map((r) => r.user)
    .filter((u): u is NonNullable<typeof memberRows[number]['user']> => Boolean(u?.email))
    .filter((u) => u.id !== actorUserId)

  if (recipients.length === 0) return

  const [senderUser] = await db.select().from(users).where(eq(users.id, actorUserId)).limit(1)
  const senderMap = userRowToMergeMap(senderUser ?? null)

  const [tpl] = await db
    .select({ content: messageTemplates.content, status: messageTemplates.status })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, AGENT_REQUESTER_REPLIES_TEMPLATE_KEY))
    .limit(1)
  if (!tpl || tpl.status !== 'active') return

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const safeBase = baseUrl.replace(/\/$/, '')
  const ticketUrl = `${safeBase}/tickets/${ticketId}`
  const subject = `Requester replied on Ticket #${ticketId}`
  const subjectMime = encodeSubjectHeader(subject)

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

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, `${safeBase}/api/email/google/callback`)
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
  const rawTpl = tpl.content?.trim() ?? ''

  for (const recipient of recipients) {
    const recipientMap = userRowToMergeMap(recipient)
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
      `<p>The requester has replied on <strong>Ticket #${ticketId}</strong>.</p>` +
      `<p><strong>${ticketTitle}</strong></p>` +
      `<p>${bodyPreview || '(attachment)'}</p>` +
      `<p>Open ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>`

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const authUser = session?.user
  if (!authUser?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const body = await request.json()
  const {
    comment,
    visibility = 'reply',
    author_type = 'agent',
    attachments = [],
    tagged_user_ids = [],
    cc_emails = [],
    bcc_emails = [],
  } = body as {
    comment?: string
    visibility?: string
    author_type?: string
    attachments?: Array<{ file_url: string; file_name: string; file_path: string }>
    tagged_user_ids?: string[]
    cc_emails?: string[]
    bcc_emails?: string[]
  }

  const role = (authUser as { role?: string }).role?.toLowerCase()
  const isCustomer = role === 'customer'
  const effectiveVisibility = isCustomer ? 'reply' : visibility
  const effectiveAuthorType = isCustomer ? 'customer' : author_type
  const effectiveTaggedIds = isCustomer ? [] : (Array.isArray(tagged_user_ids) ? tagged_user_ids : [])
  /** Portal customers must not set CC/BCC (UI disabled); ignore forged payloads. */
  const effectiveCcEmails = isCustomer ? [] : Array.isArray(cc_emails) ? cc_emails : []
  const effectiveBccEmails = isCustomer ? [] : Array.isArray(bcc_emails) ? bcc_emails : []

  const [row] = await db
    .insert(ticketComments)
    .values({
      ticketId,
      userId: authUser.id,
      comment: comment || '',
      visibility: effectiveVisibility,
      authorType: effectiveAuthorType,
      taggedUserIds: effectiveTaggedIds.length > 0 ? effectiveTaggedIds : null,
      ccEmails:
        effectiveCcEmails.length > 0 ? effectiveCcEmails.filter((e: string) => e?.trim()) : null,
      bccEmails:
        effectiveBccEmails.length > 0 ? effectiveBccEmails.filter((e: string) => e?.trim()) : null,
    })
    .returning()

  if (!row) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  await logTicketActivity({
    ticketId,
    actorUserId: authUser.id,
    actorRole: isCustomer ? 'customer' : 'agent',
    action: 'comment_added',
    relatedCommentId: row.id,
    metadata: {
      visibility: effectiveVisibility,
      author_type: effectiveAuthorType,
      body_preview: (comment || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200),
    },
  })

  const allCcEmails = [
    ...effectiveCcEmails.filter((e: string) => e?.trim()?.includes('@')),
  ].map((e: string) => e.trim().toLowerCase()).filter(Boolean)

  let ticketCompanyId: string | null = null
  if (allCcEmails.length > 0) {
    const [ticketRow] = await db.select({ companyId: tickets.companyId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
    ticketCompanyId = ticketRow?.companyId ?? null
  }

  for (const trimmed of allCcEmails) {
    if (!trimmed) continue
    try {
      await db
        .insert(ticketCcRecipients)
        .values({ ticketId, email: truncateVarchar(trimmed, 255) })
        .onConflictDoNothing({ target: [ticketCcRecipients.ticketId, ticketCcRecipients.email] })
    } catch {}

    if (ticketCompanyId) {
      const [ccUser] = await db.select({ id: users.id }).from(users).where(ilike(users.email, escapeIlike(trimmed))).limit(1)
      if (ccUser) {
        await db.update(users).set({ companyId: ticketCompanyId, updatedAt: new Date() }).where(eq(users.id, ccUser.id))
        try {
          await db.insert(companyUsers).values({ companyId: ticketCompanyId, userId: ccUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
        } catch {}
      } else {
        try {
          const [newCcUser] = await db
            .insert(users)
            .values({
              email: truncateVarchar(trimmed, 255),
              fullName: truncateVarchar(trimmed.split('@')[0] || 'User', 255),
              companyId: ticketCompanyId,
              role: 'customer',
              passwordHash: await bcrypt.hash(randomPassword(), 10),
            })
            .returning({ id: users.id })
          if (newCcUser) {
            await db.insert(companyUsers).values({ companyId: ticketCompanyId, userId: newCcUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
          }
        } catch (e) {
          console.error('[Comments] CC user create failed:', trimmed, (e as Error)?.message)
        }
      }
    }
  }

  if (attachments.length > 0) {
    await db.insert(commentAttachments).values(
      attachments.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        commentId: row.id,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: authUser.id,
      }))
    )
  }

  try {
    await runTicketCommentAutomation(ticketId, {
      visibility: effectiveVisibility,
      authorType: effectiveAuthorType,
    })
  } catch (err) {
    console.error('Automation rules error (ticket_comment_added):', err)
  }

  try {
    const [ticketRow] = await db
      .select({ title: tickets.title, createdBy: tickets.createdBy })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1)
    const assignRows = await db
      .select({ userId: ticketAssignees.userId })
      .from(ticketAssignees)
      .where(eq(ticketAssignees.ticketId, ticketId))
    const assigneeIds = assignRows.map((r) => r.userId)
    const createdBy = ticketRow?.createdBy ?? null
    const allIds = [
      ...new Set([
        ...effectiveTaggedIds,
        ...assigneeIds,
        ...(createdBy ? [createdBy] : []),
      ]),
    ]
    const taggedSet = new Set(effectiveTaggedIds)
    const mentionRecipients = allIds.filter((id) => taggedSet.has(id))
    const commentRecipients = allIds.filter((id) => !taggedSet.has(id))
    const actorName = authUser.name || authUser.email || 'Someone'
    const preview = (comment || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ') // change the nbsp to normal space
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160)
    const ticketTitle = ticketRow?.title || 'Ticket'
    if (mentionRecipients.length > 0) {
      await notifyTicketUsers({
        recipientUserIds: mentionRecipients,
        excludeUserId: authUser.id,
        ticketId,
        ticketTitle,
        type: 'mention',
        title: `${actorName} mentioned you`,
        body: preview || 'New note on ticket',
        actorUserId: authUser.id,
        actorName,
        actorRole: role ?? null,
      })
    }
    // Customer replied → notify staff on the thread (not customers; filtered in notifyTicketUsers).
    if (isCustomer && effectiveTaggedIds.length === 0 && commentRecipients.length > 0) {
      await notifyTicketUsers({
        recipientUserIds: commentRecipients,
        excludeUserId: authUser.id,
        ticketId,
        ticketTitle,
        type: 'new_comment',
        title: 'New ticket activity',
        body: `${actorName}: ${preview || '(attachment)'}`,
        actorUserId: authUser.id,
        actorName,
        actorRole: 'customer',
      })
    }
    // Staff/manager/admin reply (conversation) → notify customers on the thread only (filtered in notifyTicketUsers).
    if (
      !isCustomer &&
      effectiveVisibility === 'reply' &&
      effectiveTaggedIds.length === 0 &&
      commentRecipients.length > 0
    ) {
      await notifyTicketUsers({
        recipientUserIds: commentRecipients,
        excludeUserId: authUser.id,
        ticketId,
        ticketTitle,
        type: 'new_comment',
        title: 'New reply on ticket',
        body: `${actorName}: ${preview || '(attachment)'}`,
        actorUserId: authUser.id,
        actorName,
        actorRole: role ?? null,
      })
    }
  } catch (e) {
    console.error('[comments] firebase notify:', e)
  }

  const taggedUserPayload =
    effectiveTaggedIds.length > 0
      ? await db
          .select({ id: users.id, fullName: users.fullName, email: users.email })
          .from(users)
          .where(inArray(users.id, effectiveTaggedIds))
      : []
  const tagged_users = taggedUserPayload.map((u) => ({
    id: u.id,
    full_name: u.fullName,
    email: u.email,
  }))

  bumpTicketDataVersion(ticketId)

  if (isCustomer) {
    try {
      const [slackTicket] = await db
        .select({
          id: tickets.id,
          title: tickets.title,
          status: tickets.status,
          teamId: tickets.teamId,
          priorityId: tickets.priorityId,
          companyId: tickets.companyId,
          typeId: tickets.typeId,
        })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1)
      if (slackTicket) {
        const slackPreview = (comment || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220)
        void notifySlackTicketEvent('client_reply', {
          id: slackTicket.id,
          title: slackTicket.title,
          status: slackTicket.status,
          teamId: slackTicket.teamId ?? null,
          priorityId: slackTicket.priorityId ?? null,
          companyId: slackTicket.companyId ?? null,
          typeId: slackTicket.typeId ?? null,
          bodyPreview: slackPreview || undefined,
          actorName: authUser.name || authUser.email || undefined,
        })
      }
    } catch (err) {
      console.error('[comments] slack notify:', err)
    }

    try {
      const [ticketForMail] = await db
        .select({ title: tickets.title })
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .limit(1)
      const mailPreview = (comment || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300)
      await sendAgentRequesterRepliesEmail({
        ticketId,
        actorUserId: authUser.id,
        ticketTitle: ticketForMail?.title || 'Ticket',
        bodyPreview: mailPreview,
      })
    } catch (err) {
      console.error('[comments] team email notify:', err)
    }
  }

  return NextResponse.json({
    id: row.id,
    ticket_id: row.ticketId,
    user_id: row.userId,
    comment: row.comment,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    visibility: row.visibility ?? 'reply',
    author_type: row.authorType ?? 'agent',
    tagged_user_ids: row.taggedUserIds ?? [],
    tagged_users,
    cc_emails: row.ccEmails ?? [],
    bcc_emails: row.bccEmails ?? [],
    user: { id: authUser.id, full_name: authUser.name, email: authUser.email, avatar_url: authUser.image },
    comment_attachments: attachments.map((a: { file_url: string; file_name: string }) => ({ id: '', file_url: a.file_url, file_name: a.file_name })),
  })
}
