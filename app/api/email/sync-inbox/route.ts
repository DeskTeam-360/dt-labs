import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

/** Parse Gmail internalDate to ISO string for created_at */
function getEmailDateIso(msg: { internalDate?: string }): string | null {
  let ms = msg.internalDate ? parseInt(String(msg.internalDate), 10) : 0
  if (ms <= 0) return null
  if (ms < 1e12) ms *= 1000 // seconds -> ms
  return new Date(ms).toISOString()
}

/** Extract ticket ID from subject, e.g. "Re: [Ticket #123] Title" or "[Ticket #123]" */
function parseTicketIdFromSubject(subject: string): number | null {
  const match = subject.match(/\[Ticket #(\d+)\]/i)
  return match ? parseInt(match[1], 10) : null
}

/** Extract email from From header, e.g. "Name <a@b.com>" or "a@b.com" */
function parseEmailFromHeader(from: string): string {
  const match = from.match(/<([^>]+)>/)
  if (match) return match[1].trim().toLowerCase()
  return from.trim().toLowerCase()
}

/** Extract all email addresses from To/Cc/Bcc header string */
function parseEmailsFromRecipients(header: string): string[] {
  const out: string[] = []
  for (const part of header.split(/[,;]/)) {
    const m = part.trim().match(/<([^>]+)>/)
    out.push((m ? m[1] : part).trim().toLowerCase())
  }
  return out.filter(Boolean)
}

/** Normalize email for comparison (Gmail plus-addressing: user+tag@gmail.com → user@gmail.com) */
function normalizeForMatch(email: string): string {
  const lower = email.toLowerCase()
  const plus = lower.indexOf('+')
  const at = lower.indexOf('@')
  if (plus > 0 && at > plus && lower.endsWith('@gmail.com')) {
    return lower.slice(0, plus) + lower.slice(at)
  }
  return lower
}

/** Decode Gmail API base64url body, handles nested multipart */
function getMessageBody(payload: any): string {
  function extract(p: any): string | undefined {
    if (!p) return undefined
    if (p.body?.data) return p.body.data
    if (p.parts?.length) {
      let plain: string | undefined
      let html: string | undefined
      for (const part of p.parts) {
        const nested = extract(part)
        if (nested) {
          if (part.mimeType === 'text/html') html = nested
          else if (part.mimeType === 'text/plain') plain = nested
        }
      }
      return html ?? plain ?? (p.parts[0] ? extract(p.parts[0]) : undefined)
    }
    return undefined
  }
  const data = extract(payload)
  if (!data) return ''
  const decoded = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  return decoded
}

export async function POST(request: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const cronSecret = process.env.SYNC_INBOX_CRON_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Email integration not configured' }, { status: 503 })
    }

    // Cron/External: allow call with API key (no session required)
    const authHeader = request.headers.get('authorization')
    const apiKey = request.headers.get('x-api-key')
    const cronKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : apiKey
    const isCronCall = !!cronSecret && cronKey === cronSecret

    let supabase: Awaited<ReturnType<typeof createClient>>
    let userId: string

    if (isCronCall) {
      supabase = createAdminClient() as any
    } else {
      const cookieStore = await cookies()
      supabase = createClient(cookieStore)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const { data: integration, error: integrationError } = await supabase
      .from('email_integrations')
      .select('id, email_address, access_token, refresh_token, expires_at, created_by')
      .eq('provider', 'google')
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Email integration not connected' }, { status: 503 })
    }

    if (isCronCall && !integration.created_by) {
      return NextResponse.json({ error: 'Email integration has no created_by (connect via UI first)' }, { status: 503 })
    }
    if (isCronCall) userId = integration.created_by!

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
    const inboxEmail = integration.email_address?.toLowerCase()

    // Fetch recent messages in inbox
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:inbox',
      maxResults: 50,
    })

    const messages = listRes.data.messages || []
    const alreadyProcessed = new Set<string>()
    const threadToTicketThisRun = new Map<string, number>()

    const { data: existingMessages } = await supabase
      .from('email_messages')
      .select('gmail_message_id')
    existingMessages?.forEach((m) => alreadyProcessed.add(m.gmail_message_id))

    let addedCount = 0
    let createdCount = 0
    let skippedClaimFailed = 0
    let skippedCompanyMismatch = 0

    // Fetch all messages, sort by date (oldest first) so first email in thread is processed before replies
    const fetched: { msg: any; id: string; threadId: string | null }[] = []
    for (const msgRef of messages) {
      if (alreadyProcessed.has(msgRef.id!)) continue
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgRef.id!,
        format: 'full',
      })
      fetched.push({
        msg: msgRes.data,
        id: msgRef.id!,
        threadId: msgRes.data.threadId || null,
      })
    }
    fetched.sort((a, b) => {
      const dateA = a.msg.internalDate ? parseInt(a.msg.internalDate, 10) : 0
      const dateB = b.msg.internalDate ? parseInt(b.msg.internalDate, 10) : 0
      return dateA - dateB
    })

    for (const { msg, id: gmailMessageId, threadId: msgThreadId } of fetched) {
      const headers = (msg.payload?.headers || []) as { name: string; value: string }[]
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
      const from = getHeader('From')
      const to = getHeader('To')
      const cc = getHeader('Cc')
      const bcc = getHeader('Bcc')
      const subject = getHeader('Subject')

      const senderEmail = parseEmailFromHeader(from)
      if (!senderEmail) continue

      // Skip recipient check: messages from is:inbox are already in our inbox
      // To/Cc/Bcc can miss us (BCC, Reply-To, mailing lists, encoding)
      const body = getMessageBody(msg.payload || {}).trim()
      const rfcMessageId = getHeader('Message-ID')?.trim() || null

      // Claim message first to prevent duplicate processing from concurrent syncs
      const { error: claimErr } = await supabase.from('email_messages').insert({
        gmail_message_id: gmailMessageId,
        thread_id: msgThreadId,
        from_email: senderEmail,
        to_email: to,
        subject,
        snippet: (msg.snippet || '').slice(0, 500),
        ticket_id: null,
        direction: 'incoming',
        ...(rfcMessageId && { rfc_message_id: rfcMessageId }),
      })
      if (claimErr) {
        // Retry without rfc_message_id if column may not exist yet
        const { error: retryErr } = await supabase.from('email_messages').insert({
          gmail_message_id: gmailMessageId,
          thread_id: msgThreadId,
          from_email: senderEmail,
          to_email: to,
          subject,
          snippet: (msg.snippet || '').slice(0, 500),
          ticket_id: null,
          direction: 'incoming',
        })
        if (retryErr) {
          skippedClaimFailed++
          continue
        }
      }

      // 1) Match by thread_id (ticket, email_messages, or created this run)
      let ticketId: number | null = null
      if (msgThreadId) {
        ticketId = threadToTicketThisRun.get(msgThreadId) ?? null
        if (!ticketId) {
          const { data: byThread } = await supabase
            .from('tickets')
            .select('id')
            .eq('gmail_thread_id', msgThreadId)
            .maybeSingle()
          if (byThread) ticketId = byThread.id
        }
        if (!ticketId) {
          const { data: byMsg } = await supabase
            .from('email_messages')
            .select('ticket_id')
            .eq('thread_id', msgThreadId)
            .not('ticket_id', 'is', null)
            .limit(1)
            .maybeSingle()
          if (byMsg?.ticket_id) ticketId = byMsg.ticket_id
        }
      }

      // 2) Match by subject [Ticket #N]
      if (!ticketId) {
        ticketId = parseTicketIdFromSubject(subject)
      }

      if (ticketId) {
        // REPLY: add as comment
        const { data: ticket, error: ticketErr } = await supabase
          .from('tickets')
          .select('id, company_id, company:companies(id, email)')
          .eq('id', ticketId)
          .single()

        if (ticketErr || !ticket) continue

        const company = ticket.company as { id?: string; email?: string } | null
        const companyEmail = company?.email?.trim().toLowerCase()
        if (!companyEmail || (senderEmail !== companyEmail && normalizeForMatch(senderEmail) !== normalizeForMatch(companyEmail))) {
          skippedCompanyMismatch++
          continue
        }

        const commentBody = body || (msg.snippet || '').trim() || '(No content)'
        const emailDateIso = getEmailDateIso(msg)

        const { error: insertErr } = await supabase
          .from('todo_comments')
          .insert({
            todo_id: ticketId,
            user_id: userId,
            comment: commentBody,
            visibility: 'reply',
            author_type: 'customer',
            ...(emailDateIso && { created_at: emailDateIso }),
          })
          .single()

        if (insertErr) {
          console.error('Failed to insert comment from email:', insertErr)
          continue
        }

        await supabase.from('tickets').update({ gmail_thread_id: msgThreadId }).eq('id', ticketId).is('gmail_thread_id', null)
        await supabase.from('email_messages').update({ ticket_id: ticketId }).eq('gmail_message_id', gmailMessageId)
      } else {
        // NEW: create ticket only if no existing ticket for this thread/company/subject
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .ilike('email', senderEmail)
          .maybeSingle()

        // Dedup: same company + same thread already has ticket? (from earlier in this batch)
        let existingTicketId: number | null = null
        if (msgThreadId) existingTicketId = threadToTicketThisRun.get(msgThreadId) ?? null
        if (!existingTicketId && company?.id && msgThreadId) {
          const { data: dupByThread } = await supabase
            .from('tickets')
            .select('id')
            .eq('gmail_thread_id', msgThreadId)
            .maybeSingle()
          if (dupByThread) existingTicketId = dupByThread.id
        }
        if (!existingTicketId && msgThreadId) {
          const { data: dupByMsg } = await supabase
            .from('email_messages')
            .select('ticket_id')
            .eq('thread_id', msgThreadId)
            .not('ticket_id', 'is', null)
            .limit(1)
            .maybeSingle()
          if (dupByMsg?.ticket_id) existingTicketId = dupByMsg.ticket_id
        }

        if (existingTicketId) {
          // Already have ticket for this thread - add as comment instead of creating duplicate
          ticketId = existingTicketId
          const { data: extTicket } = await supabase.from('tickets').select('id, company_id, company:companies(id, email)').eq('id', ticketId).single()
          const extCompany = extTicket?.company as { email?: string } | null
          const extCompanyEmail = extCompany?.email?.trim().toLowerCase()
          if (extCompanyEmail && (senderEmail === extCompanyEmail || normalizeForMatch(senderEmail) === normalizeForMatch(extCompanyEmail))) {
            const commentBody = body || (msg.snippet || '').trim() || '(No content)'
            const emailDateIso = getEmailDateIso(msg)
            await supabase.from('todo_comments').insert({
              todo_id: ticketId,
              user_id: userId,
              comment: commentBody,
              visibility: 'reply',
              author_type: 'customer',
              ...(emailDateIso && { created_at: emailDateIso }),
            })
          }
          await supabase.from('email_messages').update({ ticket_id: ticketId }).eq('gmail_message_id', gmailMessageId)
        } else {
          // Only create new tickets from recent emails (last 7 days); skip old ones
          let internalDateMs = msg.internalDate ? parseInt(String(msg.internalDate), 10) : 0
          if (internalDateMs > 0 && internalDateMs < 1e12) internalDateMs *= 1000 // seconds -> ms
          const emailAgeDays = internalDateMs > 0 ? (Date.now() - internalDateMs) / (24 * 60 * 60 * 1000) : 0
          if (internalDateMs > 0 && emailAgeDays > 7) {
            alreadyProcessed.add(gmailMessageId)
            continue
          }

          const title = subject.replace(/^(Re:\s*)+/i, '').trim() || 'New support request'
          const emailDateIso = getEmailDateIso(msg)
          const { data: newTicket, error: createErr } = await supabase
            .from('tickets')
            .insert({
              title,
              description: body || null,
              created_by: userId,
              status: 'to_do',
              visibility: 'private',
              company_id: company?.id ?? null,
              ...(emailDateIso && { created_at: emailDateIso }),
            })
            .select('id')
            .single()

          if (createErr) {
            console.error('Failed to create ticket from email:', createErr)
            continue
          }

          ticketId = newTicket.id
          if (msgThreadId) threadToTicketThisRun.set(msgThreadId, ticketId)
          if (msgThreadId) {
            await supabase.from('tickets').update({ gmail_thread_id: msgThreadId }).eq('id', ticketId)
          }
          createdCount++
          await supabase.from('email_messages').update({ ticket_id: ticketId }).eq('gmail_message_id', gmailMessageId)
        }
      }

      alreadyProcessed.add(gmailMessageId)
      addedCount++
    }

    return NextResponse.json({
      success: true,
      addedCount,
      createdCount,
      ...(process.env.NODE_ENV === 'development' && {
        _debug: { skippedClaimFailed, skippedCompanyMismatch },
      }),
    })
  } catch (err: any) {
    console.error('Sync inbox error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to sync inbox' },
      { status: 500 }
    )
  }
}
