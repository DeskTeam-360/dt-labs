import { and, eq } from 'drizzle-orm'
import { google } from 'googleapis'

import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import { companies, db, emailIntegrations, messageTemplates, users } from '@/lib/db'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'

export const RECURRING_TICKET_CREATED_TEMPLATE_KEY =
  'requester_notification_recurring_ticket_created' as const

function encodeSubjectHeader(subject: string): string {
  if (/^[\x01-\x7F]*$/.test(subject)) return subject
  return '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?='
}

function mergeSubject(subject: string, ticketId: number): string {
  return subject.replace(/\{\{\s*ticket_id\s*\}\}/g, String(ticketId))
}

export type SendRecurringTicketCreatedEmailParams = {
  ticketId: number
  ticketTitle: string
  companyId: string | null
  /** Prefer this user's email when set; otherwise fall back to company.email */
  contactUserId: string | null
  /** Optional actor for {{ sender.* }} placeholders (rule creator) */
  createdByUserId?: string | null
}

/**
 * Notify company email (or contact user if set) when a recurring rule creates a ticket.
 * Uses message template `requester_notification_recurring_ticket_created`.
 */
export async function sendRecurringTicketCreatedEmail(
  params: SendRecurringTicketCreatedEmailParams
): Promise<boolean> {
  const { ticketId, ticketTitle, companyId, contactUserId, createdByUserId } = params

  let recipientEmail: string | null = null
  let recipientUser: typeof users.$inferSelect | null = null
  let companyName: string | null = null
  let companyEmail: string | null = null

  if (companyId) {
    const [companyRow] = await db
      .select({ name: companies.name, email: companies.email })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    companyName = companyRow?.name ?? null
    companyEmail = companyRow?.email?.trim() || null
  }

  if (contactUserId) {
    const [contact] = await db.select().from(users).where(eq(users.id, contactUserId)).limit(1)
    const email = contact?.email?.trim() || null
    if (email) {
      recipientEmail = email
      recipientUser = contact ?? null
    } else {
      console.warn(
        `[recurring-ticket-email] contact user ${contactUserId} has no email; falling back to company email`
      )
    }
  }

  if (!recipientEmail) {
    recipientEmail = companyEmail
  }

  if (!recipientEmail) {
    console.warn(
      `[recurring-ticket-email] skip ticket #${ticketId}: no contact email and no company email`
    )
    return false
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  if (!clientId || !clientSecret) {
    console.warn(
      `[recurring-ticket-email] skip ticket #${ticketId}: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set`
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
      `[recurring-ticket-email] skip ticket #${ticketId}: no active Google email integration`
    )
    return false
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${baseUrl.replace(/\/$/, '')}/api/email/google/callback`
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
        eq(messageTemplates.key, RECURRING_TICKET_CREATED_TEMPLATE_KEY),
        eq(messageTemplates.status, 'active')
      )
    )
    .limit(1)

  if (!tpl) {
    console.warn(
      `[recurring-ticket-email] skip ticket #${ticketId}: template ${RECURRING_TICKET_CREATED_TEMPLATE_KEY} not active`
    )
    return false
  }

  let senderUser: typeof users.$inferSelect | null = null
  if (createdByUserId) {
    const [row] = await db.select().from(users).where(eq(users.id, createdByUserId)).limit(1)
    senderUser = row ?? null
  }

  const recipientMap = userRowToMergeMap(recipientUser, companyName)
  if (!recipientUser && recipientEmail) {
    recipientMap.email = recipientEmail
    if (companyName) recipientMap.company_name = companyName
    if (recipientMap.full_name === '—') recipientMap.full_name = companyName || recipientEmail
  }

  const senderMap = userRowToMergeMap(senderUser, companyName)
  const rawTpl = tpl.content?.trim() ?? ''
  const subject = mergeSubject(
    tpl.emailSubject?.trim() || `Recurring ticket #{{ ticket_id }} has been created`,
    ticketId
  )
  const subjectMime = encodeSubjectHeader(subject)

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
    `<p>Hello${recipientMap.full_name !== '—' ? ` ${recipientMap.full_name}` : ''},</p>` +
    `<p>A scheduled recurring ticket has been created.</p>` +
    `<p><strong>Ticket #${ticketId}</strong>: ${ticketTitle}</p>` +
    `<p>You can view your ticket here: <a href="${ticketUrl}">${ticketUrl}</a></p>`

  const bodyHtml = mergedTpl || fallbackHtml
  const rawEmail = [
    `From: ${fromHeader}`,
    `To: ${recipientEmail}`,
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

  return true
}
