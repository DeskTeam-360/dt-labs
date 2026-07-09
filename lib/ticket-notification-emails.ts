import { and, eq } from 'drizzle-orm'
import { google } from 'googleapis'

import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import {
  companies,
  db,
  emailIntegrations,
  messageTemplates,
  teamMembers,
  tickets,
  users,
} from '@/lib/db'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'

async function fetchCompanyName(companyId: string | null | undefined): Promise<string | null> {
  if (!companyId) return null
  const [row] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1)
  return row?.name ?? null
}

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

type GmailSender = {
  gmail: ReturnType<typeof google.gmail>
  fromEmail: string
  integrationId: string
}

async function getGmailSender(): Promise<GmailSender | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (!clientId || !clientSecret) return null

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

  if (!integration?.accessToken) return null

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, `${baseUrl.replace(/\/$/, '')}/api/email/google/callback`)
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
        .set({ accessToken: credentials.access_token, expiresAt: new Date(credentials.expiry_date), updatedAt: new Date() })
        .where(eq(emailIntegrations.id, integration.id))
    }
  } else {
    oauth2Client.setCredentials({ access_token: accessToken })
  }

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    fromEmail: integration.emailAddress || 'noreply@example.com',
    integrationId: integration.id,
  }
}

async function sendRawEmail(sender: GmailSender, to: string, subject: string, bodyHtml: string, fromHeader?: string) {
  const subjectMime = encodeSubjectHeader(subject)
  const rawEmail = [
    `From: ${fromHeader ?? sender.fromEmail}`,
    `To: ${to}`,
    `Subject: ${subjectMime}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    bodyHtml,
  ].join('\r\n')
  const raw = Buffer.from(rawEmail).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await sender.gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

/**
 * Send `requester_notification_agent_closes` to the ticket creator when an agent closes the ticket.
 */
export async function sendAgentClosesTicketEmail(params: {
  ticketId: number
  ticketTitle: string
  agentUserId: string
}) {
  const { ticketId, ticketTitle, agentUserId } = params

  const [tpl] = await db
    .select({ content: messageTemplates.content, status: messageTemplates.status, emailSubject: messageTemplates.emailSubject })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'requester_notification_agent_closes'))
    .limit(1)
  if (!tpl || tpl.status !== 'active') return

  const [ticketRow] = await db
    .select({ createdBy: tickets.createdBy, companyId: tickets.companyId })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)
  if (!ticketRow?.createdBy) return

  const [recipient] = await db.select().from(users).where(eq(users.id, ticketRow.createdBy)).limit(1)
  if (!recipient?.email) return

  const [agent] = await db.select().from(users).where(eq(users.id, agentUserId)).limit(1)
  const companyName = await fetchCompanyName(ticketRow.companyId)

  const [gmailSender, appSettings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!gmailSender) return

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const ticketUrl = `${baseUrl}/tickets/${ticketId}`
  const fromHeader = formatFromHeader(appSettings.email_sender_name, gmailSender.fromEmail)
  const recipientMap = userRowToMergeMap(recipient, companyName)
  const senderMap = userRowToMergeMap(agent ?? null)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = tpl.emailSubject?.trim() || `Ticket #${ticketId} has been closed`

  const bodyHtml = rawTpl
    ? mergeMessageTemplateHtml(rawTpl, { origin: baseUrl, ticketId: String(ticketId), recipient: recipientMap, sender: senderMap, useDomMerge: false })
    : `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
      `<p>Your ticket <strong>#${ticketId}: ${ticketTitle}</strong> has been closed.</p>` +
      `<p>View ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>`

  await sendRawEmail(gmailSender, recipient.email, subject, bodyHtml, fromHeader)
}

/**
 * Send `agent_notification_new_ticket_created` to all team members when a ticket is
 * created by a customer (or via email). NOT sent when created by agent/staff/admin.
 */
export async function sendNewTicketAgentNotificationEmail(params: {
  ticketId: number
  ticketTitle: string
  teamId: string
  creatorUserId: string
}) {
  const { ticketId, ticketTitle, teamId, creatorUserId } = params

  const [tpl] = await db
    .select({ content: messageTemplates.content, status: messageTemplates.status, emailSubject: messageTemplates.emailSubject })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'agent_notification_new_ticket_created'))
    .limit(1)
  if (!tpl || tpl.status !== 'active') return

  const memberRows = await db
    .select({ user: users })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))

  const recipients = memberRows
    .map((r) => r.user)
    .filter((u): u is NonNullable<typeof memberRows[number]['user']> => Boolean(u?.email))
    .filter((u) => u.id !== creatorUserId)

  if (recipients.length === 0) return

  const [creator] = await db.select().from(users).where(eq(users.id, creatorUserId)).limit(1)
  const creatorCompanyName = await fetchCompanyName(creator?.companyId)
  const [gmailSender, appSettings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!gmailSender) return

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const ticketUrl = `${baseUrl}/tickets/${ticketId}`
  const fromHeader = formatFromHeader(appSettings.email_sender_name, gmailSender.fromEmail)
  const senderMap = userRowToMergeMap(creator ?? null, creatorCompanyName)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = tpl.emailSubject?.trim() || `New ticket #${ticketId} assigned to your team`

  for (const recipient of recipients) {
    const recipientCompanyName = await fetchCompanyName(recipient.companyId)
    const recipientMap = userRowToMergeMap(recipient, recipientCompanyName)
    const bodyHtml = rawTpl
      ? mergeMessageTemplateHtml(rawTpl, { origin: baseUrl, ticketId: String(ticketId), recipient: recipientMap, sender: senderMap, useDomMerge: false })
      : `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
        `<p>A new ticket has been submitted: <strong>#${ticketId}: ${ticketTitle}</strong></p>` +
        `<p>View ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>`
    await sendRawEmail(gmailSender, recipient.email, subject, bodyHtml, fromHeader)
  }
}

/**
 * Send `agent_notification_note_added` to all team members when anyone adds a note
 * (internal note, visibility = 'note').
 */
export async function sendNoteAddedNotificationEmail(params: {
  ticketId: number
  ticketTitle: string
  notePreview: string
  noteHtml?: string
  actorUserId: string
}) {
  const { ticketId, ticketTitle, notePreview, noteHtml, actorUserId } = params

  const [tpl] = await db
    .select({ content: messageTemplates.content, status: messageTemplates.status, emailSubject: messageTemplates.emailSubject })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, 'agent_notification_note_added'))
    .limit(1)
  if (!tpl || tpl.status !== 'active') return

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

  const [actor] = await db.select().from(users).where(eq(users.id, actorUserId)).limit(1)
  const actorCompanyName = await fetchCompanyName(actor?.companyId)
  const [gmailSender, appSettings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!gmailSender) return

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const ticketUrl = `${baseUrl}/tickets/${ticketId}`
  const fromHeader = formatFromHeader(appSettings.email_sender_name, gmailSender.fromEmail)
  const senderMap = userRowToMergeMap(actor ?? null, actorCompanyName)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = tpl.emailSubject?.trim() || `Note added on Ticket #${ticketId}`

  for (const recipient of recipients) {
    const recipientCompanyName = await fetchCompanyName(recipient.companyId)
    const recipientMap = userRowToMergeMap(recipient, recipientCompanyName)
    const bodyHtml = rawTpl
      ? mergeMessageTemplateHtml(rawTpl, {
          origin: baseUrl,
          ticketId: String(ticketId),
          recipient: recipientMap,
          sender: senderMap,
          extra: { reply_content: noteHtml ?? notePreview, reply_preview: notePreview },
          useDomMerge: false,
        })
      : `<p>Hello ${recipientMap.full_name !== '—' ? recipientMap.full_name : ''},</p>` +
        `<p>A note was added on <strong>Ticket #${ticketId}: ${ticketTitle}</strong></p>` +
        `<p>${notePreview || '(attachment)'}</p>` +
        `<p>View ticket: <a href="${ticketUrl}">${ticketUrl}</a></p>`
    await sendRawEmail(gmailSender, recipient.email, subject, bodyHtml, fromHeader)
  }
}
