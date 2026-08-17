import { and, asc, eq } from 'drizzle-orm'
import { google } from 'googleapis'

import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import { companies, companyUsers, db, emailIntegrations, messageTemplates, users } from '@/lib/db'
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
  /** RFC 822 Message-ID from the original customer email, used to thread the reply. */
  inReplyToMessageId?: string | null
  /** Gmail thread ID from the original email, used to keep the notification in the same Gmail thread. */
  gmailThreadId?: string | null
  /** Original customer email body (HTML or plain text) to include as a quote in the notification. */
  originalEmailBody?: string | null
}

/**
 * Sends requester_notification_new_ticket_created via active Gmail integration.
 * Returns { sent: false } when skipped, or { sent: true, sentThreadId, sentGmailMessageId, sentRfcMessageId }
 * so callers can persist the thread ID and use the sent message as In-Reply-To for agent replies.
 */
export async function sendRequesterTicketCreatedEmail(
  params: SendRequesterTicketCreatedEmailParams
): Promise<{ sent: boolean; sentThreadId?: string | null; sentGmailMessageId?: string | null; sentRfcMessageId?: string | null }> {
  const { creatorUserId, creatorRole, companyId, ticketId, ticketTitle, requesterEmailOverride, inReplyToMessageId, gmailThreadId, originalEmailBody } =
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
    return { sent: false }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.warn(
      `[requester-new-ticket-email] skip ticket #${ticketId}: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set`
    )
    return { sent: false }
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
    return { sent: false }
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
  const appSettings = await getAppSettings()
  const fromHeader = formatFromHeader(appSettings.email_sender_name, fromEmail)
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
    return { sent: false }
  }

  let companyName: string | null = null
  if (companyId) {
    const [companyRow] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1)
    companyName = companyRow?.name ?? null
  }
  const senderMap = userRowToMergeMap(creatorUser ?? null, companyName)
  const rawTpl = tpl.content?.trim() ?? ''
  const rawSubject = tpl.emailSubject?.trim() || `Ticket #${ticketId} has been created`
  const subject = rawSubject
    .replace(/\{\{\s*ticket_id\s*\}\}/g, String(ticketId))
    .replace(/\{\{\s*ticket\s*\}\}/g, `#${ticketId}`)
    .replace(/\{\{\s*ticket_link\s*\}\}/g, ticketUrl)
  const subjectMime = encodeSubjectHeader(subject)

  for (const recipient of recipientEntries) {
    const recipientMap = userRowToMergeMap(recipient.user, companyName)
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

    const notifBody = mergedTpl || fallbackHtml

    // Append the customer's original email as a blockquote so agents see the full context.
    const quoteHtml = originalEmailBody?.trim()
      ? `<br><hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0"><blockquote style="margin:0 0 0 8px;padding-left:12px;border-left:3px solid #ccc;color:#555">${originalEmailBody.trim()}</blockquote>`
      : ''

    const bodyHtml = notifBody + quoteHtml
    const rawEmailLines = [
      `From: ${fromHeader}`,
      `To: ${recipient.email}`,
      `Subject: ${subjectMime}`,
    ]
    if (inReplyToMessageId) {
      rawEmailLines.push(`In-Reply-To: ${inReplyToMessageId}`)
      rawEmailLines.push(`References: ${inReplyToMessageId}`)
    }
    rawEmailLines.push('MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', bodyHtml)
    const rawEmail = rawEmailLines.join('\r\n')

    const raw = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const requestBody: { raw: string; threadId?: string } = { raw }
    if (gmailThreadId) requestBody.threadId = gmailThreadId
    const sendRes = await gmail.users.messages.send({
      userId: 'me',
      requestBody,
    })

    const sentGmailMessageId = sendRes.data.id ?? null
    const sentThreadId = sendRes.data.threadId ?? null

    // Fetch the RFC Message-ID of the sent notification so agent replies can use it as In-Reply-To.
    let sentRfcMessageId: string | null = null
    if (sentGmailMessageId) {
      try {
        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: sentGmailMessageId,
          format: 'metadata',
          metadataHeaders: ['Message-ID'],
        })
        const msgIdHeader = (msgRes.data.payload?.headers || []).find(
          (h: { name: string; value: string }) => h.name.toLowerCase() === 'message-id'
        )
        sentRfcMessageId = msgIdHeader?.value?.trim() ?? null
      } catch {
        // Non-fatal — threading degrades gracefully
      }
    }

    return { sent: true, sentThreadId, sentGmailMessageId, sentRfcMessageId }
  }

  return { sent: true }
}
