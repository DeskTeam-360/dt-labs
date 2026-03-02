import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { ticketId, commentBody, ticketTitle, companyEmail } = body as {
      ticketId: number
      commentBody: string
      ticketTitle?: string
      companyEmail: string
    }

    if (!ticketId || !commentBody?.trim() || !companyEmail?.trim()) {
      return NextResponse.json(
        { error: 'Missing ticketId, commentBody, or companyEmail' },
        { status: 400 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Email integration not configured' },
        { status: 503 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: integration, error: integrationError } = await supabase
      .from('email_integrations')
      .select('id, email_address, access_token, refresh_token, expires_at')
      .eq('provider', 'google')
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError || !integration) {
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

    let accessToken = integration.access_token
    const expiresAt = integration.expires_at ? new Date(integration.expires_at) : null
    const needsRefresh = !expiresAt || expiresAt <= new Date()

    if (needsRefresh && integration.refresh_token) {
      oauth2Client.setCredentials({ refresh_token: integration.refresh_token })
      const { credentials } = await oauth2Client.refreshAccessToken()
      accessToken = credentials.access_token ?? integration.access_token
      if (credentials.access_token && credentials.expiry_date) {
        await supabase
          .from('email_integrations')
          .update({
            access_token: credentials.access_token,
            expires_at: new Date(credentials.expiry_date).toISOString(),
          })
          .eq('id', integration.id)
      }
    } else {
      oauth2Client.setCredentials({ access_token: accessToken })
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const fromEmail = integration.email_address || 'noreply@example.com'
    const subject = ticketTitle
      ? `Re: [Ticket #${ticketId}] ${ticketTitle}`
      : `Re: [Ticket #${ticketId}]`

    // Get thread + last incoming message for proper reply (In-Reply-To, References)
    const { data: ticketRow } = await supabase
      .from('tickets')
      .select('gmail_thread_id')
      .eq('id', ticketId)
      .single()

    const { data: lastIncoming } = await supabase
      .from('email_messages')
      .select('rfc_message_id, thread_id')
      .eq('ticket_id', ticketId)
      .eq('direction', 'incoming')
      .not('rfc_message_id', 'is', null)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let threadId = ticketRow?.gmail_thread_id || lastIncoming?.thread_id || null
    let inReplyTo = lastIncoming?.rfc_message_id || null

    // Fallback: if we have thread but no Message-ID in DB, fetch from Gmail to ensure reply
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

    const ticketUrl = `${baseUrl}/customer/tickets/${ticketId}`
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
      await supabase.from('email_messages').insert({
        gmail_message_id: sentMessageId,
        thread_id: sentThreadId || null,
        from_email: fromEmail,
        to_email: companyEmail.trim(),
        subject,
        snippet: commentBody.trim().slice(0, 500),
        ticket_id: ticketId,
        direction: 'outgoing',
      })
      if (sentThreadId) {
        await supabase
          .from('tickets')
          .update({ gmail_thread_id: sentThreadId })
          .eq('id', ticketId)
          .is('gmail_thread_id', null)
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
