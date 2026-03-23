import { auth } from '@/auth'
import { db } from '@/lib/db'
import { emailIntegrations, emailMessages, tickets } from '@/lib/db/schema'
import { eq, and, desc, isNotNull, isNull } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { ticketId, commentBody, ticketTitle, companyEmail, ccEmails = [], bccEmails = [] } = body as {
      ticketId: number
      commentBody: string
      ticketTitle?: string
      companyEmail: string
      ccEmails?: string[]
      bccEmails?: string[]
    }

    if (!ticketId || !commentBody?.trim() || !companyEmail?.trim()) {
      return NextResponse.json(
        { error: 'Missing ticketId, commentBody, or companyEmail' },
        { status: 400 }
      )
    }

    const ccList = Array.isArray(ccEmails) ? ccEmails.filter((e) => e?.trim()) : []
    const bccList = Array.isArray(bccEmails) ? bccEmails.filter((e) => e?.trim()) : []

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Email integration not configured' },
        { status: 503 }
      )
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
      return NextResponse.json(
        { error: 'Email integration not connected' },
        { status: 503 }
      )
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
    const subject = ticketTitle
      ? `Re: [Ticket #${ticketId}] ${ticketTitle}`
      : `Re: [Ticket #${ticketId}]`

    const [ticketRow] = await db
      .select({ gmailThreadId: tickets.gmailThreadId })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1)

    const [lastIncoming] = await db
      .select({ rfcMessageId: emailMessages.rfcMessageId, threadId: emailMessages.threadId })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.ticketId, ticketId),
          eq(emailMessages.direction, 'incoming'),
          isNotNull(emailMessages.rfcMessageId)
        )
      )
      .orderBy(desc(emailMessages.syncedAt))
      .limit(1)

    let threadId = ticketRow?.gmailThreadId || lastIncoming?.threadId || null
    let inReplyTo = lastIncoming?.rfcMessageId || null

    if (threadId && !inReplyTo) {
      try {
        const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId })
        const messages = threadRes.data.messages || []
        const lastMsg = messages[messages.length - 1]
        if (lastMsg?.id) {
          const msgRes = await gmail.users.messages.get({ userId: 'me', id: lastMsg.id, format: 'metadata', metadataHeaders: ['Message-ID'] })
          const msgHeaders = (msgRes.data.payload?.headers || []) as { name: string; value: string }[]
          const mid = msgHeaders.find((h) => h.name.toLowerCase() === 'message-id')?.value?.trim()
          if (mid) inReplyTo = mid
        }
      } catch {
        // continue without In-Reply-To
      }
    }

    const ticketUrl = `${baseUrl}/tickets/${ticketId}`
    const portalFooter = `<p style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#666;">To view ticket details, please visit our portal: <a href="${ticketUrl}">${ticketUrl}</a></p>`
    const bodyHtml = (commentBody.trim().includes('<')
      ? commentBody.trim()
      : commentBody.trim().replace(/\n/g, '<br>')) + portalFooter
    const headers = [
      'From: ' + fromEmail,
      'To: ' + companyEmail.trim(),
      'Subject: ' + subject,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
    ]
    if (ccList.length > 0) headers.push('Cc: ' + ccList.join(', '))
    if (bccList.length > 0) headers.push('Bcc: ' + bccList.join(', '))
    if (inReplyTo) {
      headers.push('In-Reply-To: ' + inReplyTo)
      headers.push('References: ' + inReplyTo)
    }
    headers.push('')
    headers.push(bodyHtml)
    const emailBody = headers.join('\r\n')

    const raw = Buffer.from(emailBody)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const requestBody: { raw: string; threadId?: string } = { raw }
    if (threadId) requestBody.threadId = threadId

    const sendRes = await gmail.users.messages.send({
      userId: 'me',
      requestBody,
    })

    const sentMessageId = sendRes.data.id
    const sentThreadId = sendRes.data.threadId

    if (sentMessageId) {
      await db.insert(emailMessages).values({
        gmailMessageId: sentMessageId,
        threadId: sentThreadId || null,
        fromEmail,
        toEmail: companyEmail.trim(),
        subject,
        snippet: commentBody.trim().slice(0, 500),
        ticketId,
        direction: 'outgoing',
      })
      if (sentThreadId && !ticketRow?.gmailThreadId) {
        await db
          .update(tickets)
          .set({ gmailThreadId: sentThreadId, updatedAt: new Date() })
          .where(and(eq(tickets.id, ticketId), isNull(tickets.gmailThreadId)))
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Send reply email error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to send email' },
      { status: 500 }
    )
  }
}
