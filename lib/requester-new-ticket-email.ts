import { and, asc, eq } from 'drizzle-orm'
import { google } from 'googleapis'

import { companyUsers, db, emailIntegrations, messageTemplates, users } from '@/lib/db'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'

export const REQUESTER_NEW_TICKET_TEMPLATE_KEY = 'requester_notification_new_ticket_created' as const

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

export type SendRequesterTicketCreatedEmailParams = {
  creatorUserId: string
  creatorRole: string | null | undefined
  companyId: string | null
  ticketId: number
  ticketTitle: string
  /** Optional: notify this address (e.g. inbox sender) when it differs from stored user email. */
  requesterEmailOverride?: string | null
}

/**
 * Sends requester_notification_new_ticket_created via active Gmail integration.
 * Returns false when skipped (no recipients, missing OAuth, or no integration).
 */
export async function sendRequesterTicketCreatedEmail(
  params: SendRequesterTicketCreatedEmailParams
): Promise<boolean> {
  const { creatorUserId, creatorRole, companyId, ticketId, ticketTitle, requesterEmailOverride } =
    params
  const [creatorUser] = await db.select().from(users).where(eq(users.id, creatorUserId)).limit(1)
  const creatorRoleLower = (creatorRole || creatorUser?.role || '').toLowerCase()

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
    pushRecipient(requesterEmailOverride ?? creatorUser?.email, creatorUser ?? null)
  } else if (companyId) {
    const [leaderRow] = await db
      .select({ user: users })
      .from(companyUsers)
      .leftJoin(users, eq(companyUsers.userId, users.id))
      .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.companyRole, 'company_admin')))
      .orderBy(asc(companyUsers.createdAt))
      .limit(1)
    pushRecipient(leaderRow?.user?.email, leaderRow?.user ?? null)
    if (recipientEntries.length === 0) {
      pushRecipient(requesterEmailOverride ?? creatorUser?.email, creatorUser ?? null)
    }
  } else {
    pushRecipient(requesterEmailOverride ?? creatorUser?.email, creatorUser ?? null)
  }

  if (recipientEntries.length === 0) {
    console.warn(
      `[requester-new-ticket-email] skip ticket #${ticketId}: no recipient email (creator=${creatorUserId})`
    )
    return false
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.warn(
      `[requester-new-ticket-email] skip ticket #${ticketId}: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set`
    )
    return false
  }

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

  if (!integration?.accessToken) {
    console.warn(
      `[requester-new-ticket-email] skip ticket #${ticketId}: no active Google email integration`
    )
    return false
  }

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
    .select({ content: messageTemplates.content, emailSubject: messageTemplates.emailSubject })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.key, REQUESTER_NEW_TICKET_TEMPLATE_KEY),
        eq(messageTemplates.status, 'active')
      )
    )
    .limit(1)

  if (!tpl) {
    console.warn(
      `[requester-new-ticket-email] skip ticket #${ticketId}: template ${REQUESTER_NEW_TICKET_TEMPLATE_KEY} not active`
    )
    return false
  }

  const senderMap = userRowToMergeMap(creatorUser ?? null)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = tpl.emailSubject?.trim() || `Ticket #${ticketId} has been created`
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

  return true
}
