import { auth } from '@/auth'
import { db } from '@/lib/db'
import { emailIntegrations, emailMessages, tickets } from '@/lib/db/schema'
import { getObjectBuffer } from '@/lib/storage-idrive'
import { eq, and, desc, isNotNull, isNull } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
}

function guessMimeType(fileName: string, headerType?: string): string {
  const t = headerType?.split(';')[0]?.trim()
  if (t && t !== 'binary/octet-stream' && t !== 'application/octet-stream') return t
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return MIME_BY_EXT[ext] || 'application/octet-stream'
}

function foldBase64(b64: string): string {
  const lines: string[] = []
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76))
  }
  return lines.join('\r\n')
}

function contentDispositionAttachment(fileName: string): string {
  const asciiSafe = fileName.replace(/[^\x20-\x7E]/g, '_')
  const star = encodeURIComponent(fileName)
  return `attachment; filename="${asciiSafe.replace(/["\\]/g, '_')}"; filename*=UTF-8''${star}`
}

type IncomingAttachment = { file_url?: string; file_name: string; file_path?: string }

async function loadAttachmentBytes(a: IncomingAttachment): Promise<{
  buffer: Buffer
  mime: string
  fileName: string
}> {
  const fileName = a.file_name?.trim() || 'attachment'
  if (a.file_path?.trim()) {
    const got = await getObjectBuffer(a.file_path.trim())
    if (!('error' in got)) {
      return {
        buffer: got.buffer,
        mime: guessMimeType(fileName, got.contentType),
        fileName,
      }
    }
    console.warn('[send-reply] Storage get failed for', a.file_path, got.error)
  }
  const url = a.file_url?.trim()
  if (url) {
    const res = await fetch(url)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      const ct = res.headers.get('content-type') || undefined
      return { buffer: buf, mime: guessMimeType(fileName, ct), fileName }
    }
    console.warn('[send-reply] Fetch failed for', url, res.status)
  }
  throw new Error(`Could not load attachment: ${fileName}`)
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      ticketId,
      commentBody = '',
      ticketTitle,
      toEmail: toEmailRaw,
      companyEmail: companyEmailLegacy,
      ccEmails = [],
      bccEmails = [],
      attachments: rawAttachments = [],
    } = body as {
      ticketId: number
      commentBody?: string
      ticketTitle?: string
      /** Primary recipient (e.g. ticket creator / customer) */
      toEmail?: string
      /** @deprecated use toEmail — still accepted for older clients */
      companyEmail?: string
      ccEmails?: string[]
      bccEmails?: string[]
      attachments?: IncomingAttachment[]
    }

    const recipientEmail = (typeof toEmailRaw === 'string' ? toEmailRaw.trim() : '') || (typeof companyEmailLegacy === 'string' ? companyEmailLegacy.trim() : '')

    const attachmentList = Array.isArray(rawAttachments) ? rawAttachments : []
    const bodyText = typeof commentBody === 'string' ? commentBody : ''
    const hasText = bodyText.trim().length > 0
    const hasFiles = attachmentList.length > 0

    if (!ticketId || !recipientEmail || (!hasText && !hasFiles)) {
      return NextResponse.json(
        { error: 'Missing ticketId, recipient email (toEmail), or message body / attachments' },
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
    const innerHtml =
      hasText
        ? (bodyText.trim().includes('<')
            ? bodyText.trim()
            : bodyText.trim().replace(/\n/g, '<br>'))
        : '<p>&nbsp;</p>'
    const bodyHtml = innerHtml + portalFooter

    const headers: string[] = [
      'From: ' + fromEmail,
      'To: ' + recipientEmail,
      'Subject: ' + subject,
      'MIME-Version: 1.0',
    ]
    if (ccList.length > 0) headers.push('Cc: ' + ccList.join(', '))
    if (bccList.length > 0) headers.push('Bcc: ' + bccList.join(', '))
    if (inReplyTo) {
      headers.push('In-Reply-To: ' + inReplyTo)
      headers.push('References: ' + inReplyTo)
    }

    let emailBody: string
    if (!hasFiles) {
      headers.push('Content-Type: text/html; charset=UTF-8')
      headers.push('')
      headers.push(bodyHtml)
      emailBody = headers.join('\r\n')
    } else {
      const loaded = await Promise.all(attachmentList.map((a) => loadAttachmentBytes(a)))
      const mixedBoundary = 'mix_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`)
      headers.push('')

      const parts: string[] = [
        `--${mixedBoundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        bodyHtml,
      ]
      for (const { buffer, mime, fileName } of loaded) {
        parts.push(
          `--${mixedBoundary}`,
          `Content-Type: ${mime}; name="${fileName.replace(/"/g, '')}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: ${contentDispositionAttachment(fileName)}`,
          '',
          foldBase64(buffer.toString('base64'))
        )
      }
      parts.push(`--${mixedBoundary}--`)
      emailBody = headers.join('\r\n') + '\r\n' + parts.join('\r\n')
    }

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
        toEmail: recipientEmail,
        subject,
        snippet: bodyText.trim().slice(0, 500) || (hasFiles ? `(${attachmentList.length} attachment(s))` : ''),
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
