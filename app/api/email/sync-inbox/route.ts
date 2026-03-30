import { auth } from '@/auth'
import {
  db,
  emailIntegrations,
  emailMessages,
  emailSkipList,
  tickets,
  ticketComments,
  ticketCcRecipients,
  ticketAttachments,
  commentAttachments,
  companies,
  users,
  companyUsers,
} from '@/lib/db'
import { uploadBuffer } from '@/lib/storage-idrive'
import { runAutomationRules, runTicketCommentAutomation } from '@/lib/automation-engine'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { sendAutomationLog } from '@/lib/automation-log-webhook'
import { eq, and, ilike, not, isNull, desc, gte, or, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

/** Parse Gmail internalDate to ISO string for created_at */
function getEmailDateIso(msg: { internalDate?: string }): string | null {
  let ms = msg.internalDate ? parseInt(String(msg.internalDate), 10) : 0
  if (ms <= 0) return null
  if (ms < 1e12) ms *= 1000 // seconds -> ms
  return new Date(ms).toISOString()
}

/** Extract ticket ID from subject: "[Ticket #123]", "Re: Ticket #123 - …", "Ticket #123 …", etc. */
function parseTicketIdFromSubject(subject: string): number | null {
  const bracket = subject.match(/\[Ticket\s*#(\d+)\]/i)
  if (bracket) return parseInt(bracket[1], 10)
  const plain = subject.match(/\bTicket\s*#\s*(\d+)\b/i)
  return plain ? parseInt(plain[1], 10) : null
}

/** Extract email from From header, e.g. "Name <a@b.com>" or "a@b.com" */
function parseEmailFromHeader(from: string): string {
  const match = from.match(/<([^>]+)>/)
  if (match) return match[1].trim().toLowerCase()
  return from.trim().toLowerCase()
}

/** Parse CC header to array of emails, e.g. "a@x.com, Name <b@y.com>" -> ["a@x.com", "b@y.com"] */
function parseCcHeader(cc: string): string[] {
  if (!cc?.trim()) return []
  return cc
    .split(',')
    .map((part) => {
      const m = part.trim().match(/<([^>]+)>/)
      if (m) return m[1].trim().toLowerCase()
      return part.trim().toLowerCase()
    })
    .filter((e) => e && e.includes('@'))
}

/** Extract display name from From header, e.g. "John Doe <a@b.com>" -> "John Doe" */
function parseNameFromHeader(from: string): string | null {
  const match = from.match(/^([^<]+)</)
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, '')
    return name || null
  }
  return null
}

/** Extract domain from email, e.g. "john@acme.com" -> "acme.com" */
function getDomainFromEmail(email: string): string {
  const domain = email.split('@')[1] || ''
  return domain.toLowerCase().trim()
}

/** Derive company name from email, e.g. "john@acme.com" -> "Acme" */
function companyNameFromEmail(email: string): string {
  const domain = email.split('@')[1] || email
  const base = domain.split('.')[0] || domain
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase()
}

function randomPassword(length = 24): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/** Truncate string to fit PostgreSQL VARCHAR limit (avoid "value too long" error) */
function truncateVarchar(s: string | null | undefined, maxLen: number): string {
  if (s == null || s === '') return ''
  const str = String(s).trim()
  return str.length <= maxLen ? str : str.slice(0, maxLen)
}

/** Escape special chars for ILIKE pattern (%, _, \) to avoid wildcard match */
function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/** Normalize subject for dedup: strip Re:/Fw:, trim, lowercase */
function normalizeSubject(s: string): string {
  return s.replace(/^(Re:\s*|Fwd?:\s*)+/i, '').trim().toLowerCase()
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

function decodeBodyDataBase64(b64: string | undefined): Buffer | null {
  if (!b64) return null
  try {
    return Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  } catch {
    return null
  }
}

function flattenGmailParts(part: any): any[] {
  if (!part) return []
  if (Array.isArray(part.parts) && part.parts.length > 0) {
    return part.parts.flatMap(flattenGmailParts)
  }
  return [part]
}

/** Plain + HTML from any nesting (multipart/alternative, related, etc.) */
function extractEmailTextBodies(payload: any): { html: string; plain: string } {
  const flat = flattenGmailParts(payload || {})
  let html = ''
  let plain = ''
  for (const p of flat) {
    const mt = (p.mimeType || '').toLowerCase()
    if (mt === 'text/html' && p.body?.data) {
      const buf = decodeBodyDataBase64(p.body.data)
      if (buf) {
        const s = buf.toString('utf-8')
        if (s.length > html.length) html = s
      }
    }
    if (mt === 'text/plain' && p.body?.data) {
      const buf = decodeBodyDataBase64(p.body.data)
      if (buf) {
        const s = buf.toString('utf-8')
        if (s.length > plain.length) plain = s
      }
    }
  }
  return { html, plain }
}

function normalizeContentId(raw: string | undefined): string | null {
  if (!raw) return null
  const s = raw.replace(/^<|>$/g, '').trim()
  return s || null
}

function partDispositionAndCid(part: any): { disposition: 'inline' | 'attachment' | null; contentId: string | null } {
  const headers = part.headers as { name: string; value: string }[] | undefined
  const m: Record<string, string> = {}
  for (const h of headers || []) {
    const k = h.name?.toLowerCase()
    if (k) m[k] = h.value
  }
  const cd = (m['content-disposition'] || '').toLowerCase()
  const cid = normalizeContentId(m['content-id'])
  let disposition: 'inline' | 'attachment' | null = null
  if (cd.includes('inline')) disposition = 'inline'
  else if (cd.includes('attachment')) disposition = 'attachment'
  else if (cid) disposition = 'inline'
  return { disposition, contentId: cid }
}

function sanitizeCompanyFolder(name: string | undefined): string {
  const s = (name || '').trim()
  if (!s || s.toLowerCase() === 'unknown') return 'non-company'
  const safe = s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return safe || 'non-company'
}

function sanitizeAttachmentFileName(name: string, mimeType: string): string {
  const raw = name?.trim() || 'file'
  const base = raw.replace(/\.[^.]+$/, '') || 'file'
  const extFromName = raw.includes('.') ? raw.split('.').pop()!.toLowerCase() : ''
  const ext =
    extFromName ||
    (mimeType.includes('png')
      ? 'png'
      : mimeType.includes('jpeg') || mimeType.includes('jpg')
        ? 'jpg'
        : mimeType.includes('gif')
          ? 'gif'
          : mimeType.includes('webp')
            ? 'webp'
            : mimeType.includes('pdf')
              ? 'pdf'
              : '')
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return ext ? `${safe}.${ext}` : safe
}

async function fetchGmailAttachmentBuffer(
  gmail: any,
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  try {
    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    })
    const data = res.data?.data
    if (!data) return null
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  } catch (e) {
    console.error('[Sync] Gmail attachment fetch failed:', attachmentId, (e as Error)?.message)
    return null
  }
}

function replaceContentIdsInHtml(html: string, cidToUrl: Map<string, string>): string {
  let out = html
  for (const [cid, url] of cidToUrl) {
    const enc = cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`cid:${enc}`, 'gi'), url)
  }
  return out
}

/**
 * Unduh part Gmail (attachmentId / gambar inline), unggah ke storage,
 * ganti cid: di HTML dengan URL publik, dan kumpulkan file untuk ticket_attachments / comment_attachments.
 */
async function processIncomingEmailMedia(
  gmail: any,
  gmailMessageId: string,
  payload: any,
  ticketId: number,
  companyFolder: string,
  html: string | null,
  plain: string | null,
  fallbackSnippet: string,
  storageSubfolder: 'attachments' | 'comments' = 'attachments'
): Promise<{ body: string; files: Array<{ fileUrl: string; fileName: string; filePath: string }> }> {
  const safeCompany = sanitizeCompanyFolder(companyFolder)
  const pathSeg = storageSubfolder === 'comments' ? 'comments' : 'attachments'
  const flat = flattenGmailParts(payload || {})
  const seenAttachmentIds = new Set<string>()
  const cidToUrl = new Map<string, string>()
  const files: Array<{ fileUrl: string; fileName: string; filePath: string }> = []
  let seq = 0

  for (const p of flat) {
    const aid = p.body?.attachmentId as string | undefined
    const directB64 = p.body?.data as string | undefined
    const mimeRaw = p.mimeType || 'application/octet-stream'
    const mime = mimeRaw.toLowerCase()
    let filename = typeof p.filename === 'string' && p.filename.trim() ? p.filename.trim() : 'attachment'
    const { disposition, contentId } = partDispositionAndCid(p)

    let buf: Buffer | null = null
    if (aid) {
      if (seenAttachmentIds.has(aid)) continue
      seenAttachmentIds.add(aid)
      buf = await fetchGmailAttachmentBuffer(gmail, gmailMessageId, aid)
    } else if (directB64 && mime.startsWith('image/')) {
      buf = decodeBodyDataBase64(directB64)
    }

    if (!buf || buf.length === 0) continue

    const isImage = mime.startsWith('image/')
    const safeName = sanitizeAttachmentFileName(filename, mime)
    const filePath = `tickets/${safeCompany}/#${ticketId}/${pathSeg}/${Date.now()}_${seq++}_${safeName}`
    const { url, error } = await uploadBuffer(filePath, buf, mimeRaw || 'application/octet-stream')
    if (error || !url) {
      console.error('[Sync] email media upload failed:', error, filename)
      continue
    }

    if (isImage && contentId) {
      cidToUrl.set(contentId, url)
      const shortId = contentId.split('@')[0]
      if (shortId && shortId !== contentId) cidToUrl.set(shortId, url)
    }

    const hideFromAttachmentList = isImage && !!contentId && disposition !== 'attachment'
    if (!hideFromAttachmentList) {
      files.push({ fileUrl: url, fileName: filename, filePath })
    }
  }

  let body = ''
  if (html && html.trim()) {
    body = replaceContentIdsInHtml(html, cidToUrl).trim()
  } else if (plain && plain.trim()) {
    body = plain.trim()
  } else {
    body = (fallbackSnippet || '').trim() || '(No content)'
  }
  return { body, files }
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

    let userId!: string

    if (isCronCall) {
      // Cron: no session, userId from integration below
    } else {
      const session = await auth()
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = session.user.id
    }

    const [integration] = await db
      .select()
      .from(emailIntegrations)
      .where(
        and(
          eq(emailIntegrations.provider, 'google'),
          eq(emailIntegrations.isActive, true)
        )
      )
      .limit(1)

    if (!integration) {
      return NextResponse.json({ error: 'Email integration not connected' }, { status: 503 })
    }

    if (isCronCall) {
      if (!integration.createdBy) {
        return NextResponse.json({ error: 'Email integration has no created_by (connect via UI first)' }, { status: 503 })
      }
      userId = integration.createdBy
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

    // Fetch only since last sync (atau 2 hari untuk first sync)
    const lastSyncAt = integration.lastSyncAt ? new Date(integration.lastSyncAt) : null
    const twoDaysAgo = Math.floor((Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000)
    const sinceSeconds = lastSyncAt
      ? Math.floor(lastSyncAt.getTime() / 1000)
      : twoDaysAgo
    const searchQuery = `is:inbox after:${sinceSeconds}`

    // Paginate to fetch all matching messages (Gmail defaults to max 50 per page)
    const messages: { id: string }[] = []
    let pageToken: string | undefined = undefined
    while (true) {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: searchQuery,
        maxResults: 100,
        pageToken,
      }) as { data: { messages?: { id?: string }[]; nextPageToken?: string | null } }
      const batch = (listRes.data.messages || []).filter(
        (m: { id?: string }): m is { id: string } => !!m?.id
      )
      messages.push(...batch)
      pageToken = listRes.data.nextPageToken ?? undefined
      if (!pageToken) break
    }
    const alreadyProcessed = new Set<string>()
    const threadToTicketThisRun = new Map<string, number>()

    const existingMessagesRows = await db.select({ gmailMessageId: emailMessages.gmailMessageId }).from(emailMessages)
    existingMessagesRows.forEach((m) => alreadyProcessed.add(m.gmailMessageId))

    let addedCount = 0
    let createdCount = 0
    let skippedClaimFailed = 0
    let skippedCompanyMismatch = 0
    const debugLog: { email: string; subject: string; reason: string }[] = []
    const isDebug = process.env.NODE_ENV === 'development'

    if (isDebug) {
      const alreadyCount = messages.filter((m) => alreadyProcessed.has(m.id)).length
      console.log('[Sync] Gmail query:', searchQuery)
      console.log('[Sync] totalFromGmail:', messages.length, '| alreadyInDb:', alreadyCount, '| toProcess:', messages.length - alreadyCount)
    }

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
      const subject = getHeader('Subject')
      let ccHeader = getHeader('Cc') || getHeader('CC')
      if (!ccHeader?.trim() && msg.payload?.parts?.length) {
        for (const part of msg.payload.parts) {
          const partHeaders = (part?.headers || []) as { name: string; value: string }[]
          const ph = partHeaders.find((h) => h.name.toLowerCase() === 'cc')?.value
          if (ph?.trim()) {
            ccHeader = ph
            break
          }
        }
      }
      const incomingCcEmails = parseCcHeader(ccHeader || '')
      if (isDebug && incomingCcEmails.length > 0) {
        console.log('[Sync] CC parsed:', incomingCcEmails.length, 'emails:', incomingCcEmails.join(', '))
      }

      const senderEmail = parseEmailFromHeader(from)
      if (!senderEmail) {
        if (isDebug) debugLog.push({ email: from || '(no from)', subject: subject || '', reason: 'SKIP: no sender email parsed' })
        continue
      }

      const textBodies = extractEmailTextBodies(msg.payload || {})
      const body = (textBodies.html || textBodies.plain || '').trim()
      const rfcMessageId = getHeader('Message-ID')?.trim() || null

      try {
        await db.insert(emailMessages).values({
          gmailMessageId: truncateVarchar(gmailMessageId, 255),
          threadId: msgThreadId ? truncateVarchar(msgThreadId, 255) : null,
          fromEmail: truncateVarchar(senderEmail, 255),
          toEmail: truncateVarchar(to, 255),
          subject: subject || null,
          snippet: (msg.snippet || '').slice(0, 500) || null,
          ticketId: null,
          direction: 'incoming',
          ...(rfcMessageId && { rfcMessageId: truncateVarchar(rfcMessageId, 512) }),
        })
      } catch (claimErr: any) {
        try {
          await db.insert(emailMessages).values({
            gmailMessageId: truncateVarchar(gmailMessageId, 255),
            threadId: msgThreadId ? truncateVarchar(msgThreadId, 255) : null,
            fromEmail: truncateVarchar(senderEmail, 255),
            toEmail: truncateVarchar(to, 255),
            subject: subject || null,
            snippet: (msg.snippet || '').slice(0, 500) || null,
            ticketId: null,
            direction: 'incoming',
          })
        } catch (retryErr) {
          skippedClaimFailed++
          if (isDebug) {
            debugLog.push({ email: senderEmail, subject: subject || '', reason: 'SKIP: insert email_messages failed (duplicate?)' })
            console.log('[Sync] SKIP insert_failed:', senderEmail, subject?.slice(0, 50),'Where: ', retryErr
          )
          }
          continue
        }
      }

      const [skipRow] = await db
        .select({ id: emailSkipList.id })
        .from(emailSkipList)
        .where(ilike(emailSkipList.email, escapeIlike(senderEmail)))
        .limit(1)

      if (skipRow) {
        alreadyProcessed.add(gmailMessageId)
        if (isDebug) {
          debugLog.push({ email: senderEmail, subject: subject || '', reason: 'SKIP: in email_skip_list' })
          console.log('[Sync] SKIP skip_list:', senderEmail, subject?.slice(0, 50))
        }
        continue
      }

      let ticketId: number | null = null
      if (msgThreadId) {
        ticketId = threadToTicketThisRun.get(msgThreadId) ?? null
        if (!ticketId) {
          const [byThread] = await db
            .select({ id: tickets.id })
            .from(tickets)
            .where(eq(tickets.gmailThreadId, msgThreadId))
            .limit(1)
          if (byThread) ticketId = byThread.id
        }
        if (!ticketId) {
          const [byMsg] = await db
            .select({ ticketId: emailMessages.ticketId })
            .from(emailMessages)
            .where(
              and(
                eq(emailMessages.threadId, msgThreadId),
                not(isNull(emailMessages.ticketId))
              )
            )
            .orderBy(desc(emailMessages.syncedAt))
            .limit(1)
          if (byMsg?.ticketId) ticketId = byMsg.ticketId
        }
      }

      if (!ticketId) {
        ticketId = parseTicketIdFromSubject(subject)
      }

      if (ticketId) {
        const [ticketRow] = await db
          .select({ id: tickets.id, companyId: tickets.companyId })
          .from(tickets)
          .where(eq(tickets.id, ticketId))
          .limit(1)

        if (!ticketRow) continue

        let companyEmail: string | null = null
        if (ticketRow.companyId) {
          const [companyRow] = await db
            .select({ email: companies.email })
            .from(companies)
            .where(eq(companies.id, ticketRow.companyId))
            .limit(1)
          companyEmail = companyRow?.email?.trim().toLowerCase() ?? null
        }

        const senderMatchesCompany = companyEmail && (senderEmail === companyEmail || normalizeForMatch(senderEmail) === normalizeForMatch(companyEmail))

        let isFromCc = false
        if (!senderMatchesCompany) {
          const ccRows = await db
            .select({ ccEmails: ticketComments.ccEmails })
            .from(ticketComments)
            .where(eq(ticketComments.ticketId, ticketId))
          const allCc = ccRows.flatMap((r) => (Array.isArray(r.ccEmails) ? r.ccEmails : []))
          const senderNorm = normalizeForMatch(senderEmail)
          isFromCc = allCc.some((e) => e?.trim() && normalizeForMatch(e.trim()) === senderNorm)
        }

        if (!senderMatchesCompany && !isFromCc) {
          skippedCompanyMismatch++
          if (isDebug) {
            debugLog.push({ email: senderEmail, subject: subject || '', reason: `SKIP: company_mismatch (ticket company email: ${companyEmail || 'null'})` })
            console.log('[Sync] SKIP company_mismatch:', senderEmail, 'ticket company:', companyEmail)
          }
          continue
        }

        let commentUserId = userId
        if (senderMatchesCompany) {
          const [companyUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(ilike(users.email, escapeIlike(senderEmail)))
            .limit(1)
          if (companyUser) commentUserId = companyUser.id
        } else if (isFromCc && ticketRow.companyId) {
          const [existingCcUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(ilike(users.email, escapeIlike(senderEmail)))
            .limit(1)
          if (existingCcUser) {
            commentUserId = existingCcUser.id
            await db.update(users).set({ companyId: ticketRow.companyId, updatedAt: new Date() }).where(eq(users.id, existingCcUser.id))
            try {
              await db
                .insert(companyUsers)
                .values({ companyId: ticketRow.companyId, userId: existingCcUser.id })
                .onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
            } catch {}
          } else {
            const displayName = parseNameFromHeader(from) || senderEmail.split('@')[0] || 'User'
            const [newUser] = await db
              .insert(users)
              .values({
                email: truncateVarchar(senderEmail, 255),
                fullName: truncateVarchar(displayName, 255),
                companyId: ticketRow.companyId,
                role: 'customer',
                passwordHash: await bcrypt.hash(randomPassword(), 10),
              })
              .returning({ id: users.id })
            if (newUser) {
              commentUserId = newUser.id
              try {
                await db
                  .insert(companyUsers)
                  .values({ companyId: ticketRow.companyId, userId: newUser.id })
                  .onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
              } catch {}
            }
          }
        }

        const emailDateIso = getEmailDateIso(msg)
        let companyFolderReply = 'non-company'
        if (ticketRow.companyId) {
          const [cnReply] = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, ticketRow.companyId))
            .limit(1)
          companyFolderReply = cnReply?.name || 'non-company'
        }
        const snippetFallbackReply = (msg.snippet || '').trim() || '(No content)'
        const processedReply = await processIncomingEmailMedia(
          gmail,
          gmailMessageId,
          msg.payload,
          ticketId,
          companyFolderReply,
          textBodies.html || null,
          textBodies.plain || null,
          snippetFallbackReply,
          'comments'
        )
        const commentBody = processedReply.body || snippetFallbackReply

        for (const ccEmail of incomingCcEmails) {
          if (!ccEmail?.trim() || !ticketRow.companyId) continue
          try {
            await db
              .insert(ticketCcRecipients)
              .values({ ticketId, email: truncateVarchar(ccEmail.trim(), 255) })
              .onConflictDoNothing({ target: [ticketCcRecipients.ticketId, ticketCcRecipients.email] })
          } catch (e) {
            if (isDebug) console.log('[Sync] ticketCcRecipients insert:', (e as Error)?.message)
          }
          const [ccUser] = await db.select({ id: users.id }).from(users).where(ilike(users.email, escapeIlike(ccEmail))).limit(1)
          if (ccUser) {
            await db.update(users).set({ companyId: ticketRow.companyId, updatedAt: new Date() }).where(eq(users.id, ccUser.id))
            try {
              await db.insert(companyUsers).values({ companyId: ticketRow.companyId, userId: ccUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
            } catch {}
          } else {
            try {
              const [newCcUser] = await db
                .insert(users)
                .values({
                  email: truncateVarchar(ccEmail, 255),
                  fullName: truncateVarchar(ccEmail.split('@')[0] || 'User', 255),
                  companyId: ticketRow.companyId,
                  role: 'customer',
                  passwordHash: await bcrypt.hash(randomPassword(), 10),
                })
                .returning({ id: users.id })
              if (newCcUser) {
                await db.insert(companyUsers).values({ companyId: ticketRow.companyId, userId: newCcUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
              }
            } catch (e) {
              console.error('[Sync] CC user create failed:', ccEmail, (e as Error)?.message)
            }
          }
        }

        try {
          const [insertedReplyComment] = await db
            .insert(ticketComments)
            .values({
              ticketId,
              userId: commentUserId,
              comment: commentBody,
              visibility: 'reply',
              authorType: 'customer',
              ccEmails: incomingCcEmails.length > 0 ? incomingCcEmails.map((e) => truncateVarchar(e.trim(), 255)) : null,
              ...(emailDateIso && { createdAt: new Date(emailDateIso) }),
            })
            .returning({ id: ticketComments.id })

          if (insertedReplyComment && processedReply.files.length > 0) {
            await db.insert(commentAttachments).values(
              processedReply.files.map((f) => ({
                commentId: insertedReplyComment.id,
                fileUrl: f.fileUrl,
                fileName: truncateVarchar(f.fileName, 2048),
                filePath: f.filePath,
                uploadedBy: commentUserId,
              }))
            )
          }
          if (insertedReplyComment) {
            await logTicketActivity({
              ticketId,
              actorUserId: commentUserId,
              actorRole: 'customer',
              action: 'comment_added',
              relatedCommentId: insertedReplyComment.id,
              metadata: {
                visibility: 'reply',
                author_type: 'customer',
                source: 'email',
                sender_email: senderEmail,
                body_preview: (commentBody || '').slice(0, 200),
              },
            })
            try {
              await runTicketCommentAutomation(ticketId, { visibility: 'reply', authorType: 'customer' })
            } catch (err) {
              console.error('Automation rules error (ticket_comment_added):', err)
            }
          }
          if (isFromCc) {
            sendAutomationLog({
              event: 'email_reply_added',
              ticket_id: ticketId,
              email: senderEmail,
              subject: subject || '',
              message: commentBody?.slice(0, 200) || '',
              detail: 'cc_recipient',
            }).catch(() => {})
          }
        } catch (insertErr) {
          console.error('Failed to insert comment from email:', insertErr)
          continue
        }

        if (msgThreadId) {
          const [curTicket] = await db.select({ gmailThreadId: tickets.gmailThreadId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
          if (curTicket && !curTicket.gmailThreadId) {
            await db.update(tickets).set({ gmailThreadId: truncateVarchar(msgThreadId, 255), updatedAt: new Date() }).where(eq(tickets.id, ticketId))
          }
        }
        await db.update(emailMessages).set({ ticketId }).where(eq(emailMessages.gmailMessageId, gmailMessageId))
      } else {
        // Match company: 1) email exact match, 2) domain in domain_list (user@acme.com → acme.com)
        // Rule: user email = company email → user is part of company; domain in list → user is part of company
        const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1]!.toLowerCase() : ''
        const companyRows = await db
          .select({ id: companies.id, name: companies.name, email: companies.email, domainList: companies.domainList })
          .from(companies)
          .where(
            senderDomain
              ? or(
                  ilike(companies.email, escapeIlike(senderEmail)),
                  sql`${senderDomain} = ANY(COALESCE(${companies.domainList}, ARRAY[]::text[]))`
                )
              : ilike(companies.email, escapeIlike(senderEmail))
          )
          .limit(2)
        // Prefer email match over domain match
        let company = companyRows.find((r) => r.email?.toLowerCase() === senderEmail) ?? companyRows[0] ?? null

        let creatorUserId: string | null = null
        let ticketCompanyId: string | null = company?.id ?? null

        const [existingUser] = await db
          .select({ id: users.id, companyId: users.companyId })
          .from(users)
          .where(ilike(users.email, escapeIlike(senderEmail)))
          .limit(1)

        if (existingUser) {
          creatorUserId = existingUser.id
          ticketCompanyId = existingUser.companyId ?? company?.id ?? null
          // Update user's companyId if they belong to company (email match or domain match) but weren't linked
          if (company?.id && !existingUser.companyId) {
            await db.update(users).set({ companyId: company.id, updatedAt: new Date() }).where(eq(users.id, existingUser.id))
            ticketCompanyId = company.id
          }
        } else {
          const displayName = parseNameFromHeader(from) || senderEmail.split('@')[0] || 'User'
          const newCompanyName = company?.name || companyNameFromEmail(senderEmail)

          // Prevent double company: check again before insert (by email or domain)
          if (!company?.id) {
            const [existingByDomain] = await db
              .select({ id: companies.id, name: companies.name, email: companies.email, domainList: companies.domainList })
              .from(companies)
              .where(sql`${senderDomain} = ANY(COALESCE(${companies.domainList}, ARRAY[]::text[]))`)
              .limit(1)
            if (existingByDomain) {
              company = existingByDomain
            }
          }
          if (!company?.id) {
            const [newCompany] = await db
              .insert(companies)
              .values({
                name: truncateVarchar(newCompanyName, 255),
                email: truncateVarchar(senderEmail, 255),
                domainList: senderDomain ? [senderDomain] : [],
              })
              .returning({ id: companies.id, name: companies.name, email: companies.email })
            if (newCompany) {
              company = { id: newCompany.id, name: newCompany.name ?? newCompanyName, email: newCompany.email ?? senderEmail, domainList: senderDomain ? [senderDomain] : [] }
            }
          }

          if (company?.id) {
            const password = randomPassword()
            const passwordHash = await bcrypt.hash(password, 10)
            // Use select-then-insert/update to avoid ON CONFLICT (works when users.email UNIQUE constraint is missing)
            const [byEmail] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, truncateVarchar(senderEmail, 255)))
              .limit(1)
            if (byEmail) {
              await db
                .update(users)
                .set({
                  fullName: truncateVarchar(displayName, 255),
                  companyId: company.id,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, byEmail.id))
              creatorUserId = byEmail.id
            } else {
              const [inserted] = await db
                .insert(users)
                .values({
                  email: truncateVarchar(senderEmail, 255),
                  fullName: truncateVarchar(displayName, 255),
                  companyId: company.id,
                  role: 'customer',
                  passwordHash,
                })
                .returning({ id: users.id })
              if (inserted) creatorUserId = inserted.id
            }
          }
        }

        let existingTicketId: number | null = null
        if (msgThreadId) {
          existingTicketId = threadToTicketThisRun.get(msgThreadId) ?? null
          if (!existingTicketId) {
            const [dupByThread] = await db
              .select({ id: tickets.id })
              .from(tickets)
              .where(eq(tickets.gmailThreadId, msgThreadId))
              .limit(1)
            if (dupByThread) existingTicketId = dupByThread.id
          }
          if (!existingTicketId) {
            const [dupByMsg] = await db
              .select({ ticketId: emailMessages.ticketId })
              .from(emailMessages)
              .where(
                and(
                  eq(emailMessages.threadId, msgThreadId),
                  not(isNull(emailMessages.ticketId))
                )
              )
              .orderBy(desc(emailMessages.syncedAt))
              .limit(1)
            if (dupByMsg?.ticketId) existingTicketId = dupByMsg.ticketId
          }
        }

        if (!ticketCompanyId) {
          if (isDebug) {
            debugLog.push({ email: senderEmail, subject: subject || '', reason: 'SKIP: no company match for sender domain/email' })
            console.log('[Sync] SKIP no_company:', senderEmail, 'domain:', senderDomain)
          }
          continue
        }

        if (!existingTicketId && ticketCompanyId) {
          const normSubj = normalizeSubject(subject)
          const since = new Date(Date.now() - 48 * 60 * 60 * 1000)
          const dupBySubject = await db
            .select({ id: tickets.id, title: tickets.title })
            .from(tickets)
            .where(
              and(
                eq(tickets.companyId, ticketCompanyId),
                eq(tickets.createdVia, 'email'),
                gte(tickets.createdAt, since)
              )
            )
            .orderBy(desc(tickets.createdAt))
            .limit(20)
          const match = dupBySubject.find((t) => normalizeSubject(t.title || '') === normSubj)
          if (match) existingTicketId = match.id
        }

        if (existingTicketId) {
          ticketId = existingTicketId
          if (msgThreadId) threadToTicketThisRun.set(msgThreadId, ticketId)

          const [extTicket] = await db
            .select({ id: tickets.id, companyId: tickets.companyId })
            .from(tickets)
            .where(eq(tickets.id, ticketId))
            .limit(1)

          let extCompanyEmail: string | null = null
          if (extTicket?.companyId) {
            const [extCompany] = await db.select({ email: companies.email }).from(companies).where(eq(companies.id, extTicket.companyId!)).limit(1)
            extCompanyEmail = extCompany?.email?.trim().toLowerCase() ?? null
          }

          const senderMatches = extCompanyEmail && (senderEmail === extCompanyEmail || normalizeForMatch(senderEmail) === normalizeForMatch(extCompanyEmail))
          const isFromCompanyUser = ticketCompanyId && extTicket?.companyId === ticketCompanyId

          let isFromCcRecipient = false
          if (extTicket?.companyId && !senderMatches && !isFromCompanyUser) {
            const ccRows = await db
              .select({ ccEmails: ticketComments.ccEmails })
              .from(ticketComments)
              .where(eq(ticketComments.ticketId, ticketId))
            const allCc = ccRows.flatMap((r) => (Array.isArray(r.ccEmails) ? r.ccEmails : []))
            const senderNorm = normalizeForMatch(senderEmail)
            isFromCcRecipient = allCc.some((e) => e?.trim() && normalizeForMatch(e.trim()) === senderNorm)
          }

          if (senderMatches || isFromCompanyUser || isFromCcRecipient) {
            const emailDateIso = getEmailDateIso(msg)
            let companyFolderExt = 'non-company'
            if (extTicket?.companyId) {
              const [cnExt] = await db
                .select({ name: companies.name })
                .from(companies)
                .where(eq(companies.id, extTicket.companyId))
                .limit(1)
              companyFolderExt = cnExt?.name || 'non-company'
            }
            const snippetFallbackExt = (msg.snippet || '').trim() || '(No content)'
            const processedExtReply = await processIncomingEmailMedia(
              gmail,
              gmailMessageId,
              msg.payload,
              ticketId,
              companyFolderExt,
              textBodies.html || null,
              textBodies.plain || null,
              snippetFallbackExt,
              'comments'
            )
            const commentBody = processedExtReply.body || snippetFallbackExt
            let commentUserId = creatorUserId ?? userId
            if (isFromCcRecipient && extTicket?.companyId) {
              const [ccUser] = await db
                .select({ id: users.id })
                .from(users)
                .where(ilike(users.email, escapeIlike(senderEmail)))
                .limit(1)
              if (ccUser) {
                commentUserId = ccUser.id
                await db.update(users).set({ companyId: extTicket.companyId, updatedAt: new Date() }).where(eq(users.id, ccUser.id))
                try {
                  await db
                    .insert(companyUsers)
                    .values({ companyId: extTicket.companyId, userId: ccUser.id })
                    .onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
                } catch {}
              } else {
                const displayName = parseNameFromHeader(from) || senderEmail.split('@')[0] || 'User'
                const [newCcUser] = await db
                  .insert(users)
                  .values({
                    email: truncateVarchar(senderEmail, 255),
                    fullName: truncateVarchar(displayName, 255),
                    companyId: extTicket.companyId,
                    role: 'customer',
                    passwordHash: await bcrypt.hash(randomPassword(), 10),
                  })
                  .returning({ id: users.id })
                if (newCcUser) {
                  commentUserId = newCcUser.id
                  try {
                    await db
                      .insert(companyUsers)
                      .values({ companyId: extTicket.companyId, userId: newCcUser.id })
                      .onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
                  } catch {}
                }
              }
            }
            for (const ccEmail of incomingCcEmails) {
              if (!ccEmail?.trim() || !extTicket?.companyId) continue
              try {
                await db
                  .insert(ticketCcRecipients)
                  .values({ ticketId, email: truncateVarchar(ccEmail.trim(), 255) })
                  .onConflictDoNothing({ target: [ticketCcRecipients.ticketId, ticketCcRecipients.email] })
              } catch (e) {
                if (isDebug) console.log('[Sync] ticketCcRecipients insert:', (e as Error)?.message)
              }
              const [ccUser] = await db.select({ id: users.id }).from(users).where(ilike(users.email, escapeIlike(ccEmail))).limit(1)
              if (ccUser) {
                await db.update(users).set({ companyId: extTicket.companyId, updatedAt: new Date() }).where(eq(users.id, ccUser.id))
                try {
                  await db.insert(companyUsers).values({ companyId: extTicket.companyId, userId: ccUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
                } catch {}
              } else {
                try {
                  const [newCcUser] = await db
                    .insert(users)
                    .values({
                      email: truncateVarchar(ccEmail, 255),
                      fullName: truncateVarchar(ccEmail.split('@')[0] || 'User', 255),
                      companyId: extTicket.companyId,
                      role: 'customer',
                      passwordHash: await bcrypt.hash(randomPassword(), 10),
                    })
                    .returning({ id: users.id })
                  if (newCcUser) {
                    await db.insert(companyUsers).values({ companyId: extTicket.companyId, userId: newCcUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
                  }
                } catch (e) {
                  console.error('[Sync] CC user create failed:', ccEmail, (e as Error)?.message)
                }
              }
            }
            const [insertedExtComment] = await db
              .insert(ticketComments)
              .values({
                ticketId,
                userId: commentUserId,
                comment: commentBody,
                visibility: 'reply',
                authorType: 'customer',
                ccEmails: incomingCcEmails.length > 0 ? incomingCcEmails.map((e) => truncateVarchar(e.trim(), 255)) : null,
                ...(emailDateIso && { createdAt: new Date(emailDateIso) }),
              })
              .returning({ id: ticketComments.id })

            if (insertedExtComment && processedExtReply.files.length > 0) {
              await db.insert(commentAttachments).values(
                processedExtReply.files.map((f) => ({
                  commentId: insertedExtComment.id,
                  fileUrl: f.fileUrl,
                  fileName: truncateVarchar(f.fileName, 2048),
                  filePath: f.filePath,
                  uploadedBy: commentUserId,
                }))
              )
            }
            if (insertedExtComment) {
              await logTicketActivity({
                ticketId,
                actorUserId: commentUserId,
                actorRole: 'customer',
                action: 'comment_added',
                relatedCommentId: insertedExtComment.id,
                metadata: {
                  visibility: 'reply',
                  author_type: 'customer',
                  source: 'email',
                  sender_email: senderEmail,
                  body_preview: (commentBody || '').slice(0, 200),
                },
              })
              try {
                await runTicketCommentAutomation(ticketId, { visibility: 'reply', authorType: 'customer' })
              } catch (err) {
                console.error('Automation rules error (ticket_comment_added):', err)
              }
            }
            sendAutomationLog({
              event: 'email_reply_added',
              ticket_id: ticketId,
              email: senderEmail,
              subject: subject || '',
              message: commentBody?.slice(0, 200) || '',
              detail: `company=${extTicket?.companyId ?? ''}`,
            }).catch(() => {})
            if (isDebug) {
              debugLog.push({ email: senderEmail, subject: subject || '', reason: `OK: reply added to ticket #${ticketId}` })
            }
          } else if (isDebug) {
            debugLog.push({ email: senderEmail, subject: subject || '', reason: `SKIP: reply sender mismatch (ticket #${ticketId})` })
          }
          await db.update(emailMessages).set({ ticketId }).where(eq(emailMessages.gmailMessageId, gmailMessageId))
        } else {
          let internalDateMs = msg.internalDate ? parseInt(String(msg.internalDate), 10) : 0
          if (internalDateMs > 0 && internalDateMs < 1e12) internalDateMs *= 1000
          const emailAgeDays = internalDateMs > 0 ? (Date.now() - internalDateMs) / (24 * 60 * 60 * 1000) : 0
          if (internalDateMs > 0 && emailAgeDays > 7) {
            alreadyProcessed.add(gmailMessageId)
            if (isDebug) {
              debugLog.push({ email: senderEmail, subject: subject || '', reason: `SKIP: email_age > 7 days (${emailAgeDays.toFixed(1)} days)` })
              console.log('[Sync] SKIP age_over_7d:', senderEmail, `${emailAgeDays.toFixed(1)} days`)
            }
            continue
          }

          const title = truncateVarchar(subject.replace(/^(Re:\s*)+/i, '').trim() || 'New support request', 255)
          const emailDateIso = getEmailDateIso(msg)

          const [newTicket] = await db
            .insert(tickets)
            .values({
              title,
              description: body || null,
              createdBy: creatorUserId ?? null,
              status: 'to_do',
              visibility: 'public',
              companyId: ticketCompanyId,
              createdVia: 'email',
              ...(emailDateIso && { createdAt: new Date(emailDateIso) }),
            })
            .returning({ id: tickets.id })

          if (!newTicket) {
            console.error('Failed to create ticket from email')
            continue
          }

          ticketId = newTicket.id
          if (msgThreadId && ticketId != null) {
            threadToTicketThisRun.set(msgThreadId, ticketId)
            await db.update(tickets).set({ gmailThreadId: truncateVarchar(msgThreadId, 255), updatedAt: new Date() }).where(eq(tickets.id, ticketId))
          }

          // Add CC recipients to ticket and create users as customers in company
          if (ticketCompanyId && incomingCcEmails.length > 0) {
            for (const ccEmail of incomingCcEmails) {
              if (!ccEmail?.trim()) continue
              try {
                await db
                  .insert(ticketCcRecipients)
                  .values({ ticketId, email: truncateVarchar(ccEmail.trim(), 255) })
                  .onConflictDoNothing({ target: [ticketCcRecipients.ticketId, ticketCcRecipients.email] })
              } catch (e) {
                if (isDebug) console.log('[Sync] ticketCcRecipients insert (new ticket):', (e as Error)?.message)
              }
              const [ccUser] = await db.select({ id: users.id }).from(users).where(ilike(users.email, escapeIlike(ccEmail))).limit(1)
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
                      email: truncateVarchar(ccEmail, 255),
                      fullName: truncateVarchar(ccEmail.split('@')[0] || 'User', 255),
                      companyId: ticketCompanyId,
                      role: 'customer',
                      passwordHash: await bcrypt.hash(randomPassword(), 10),
                    })
                    .returning({ id: users.id })
                  if (newCcUser) {
                    await db.insert(companyUsers).values({ companyId: ticketCompanyId, userId: newCcUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
                  }
                } catch (e) {
                  console.error('[Sync] CC user create failed (new ticket):', ccEmail, (e as Error)?.message)
                }
              }
            }
          }

          let companyFolderNew = company?.name || 'non-company'
          if (ticketCompanyId && (!companyFolderNew || companyFolderNew === 'non-company')) {
            const [rCo] = await db
              .select({ name: companies.name })
              .from(companies)
              .where(eq(companies.id, ticketCompanyId))
              .limit(1)
            if (rCo?.name) companyFolderNew = rCo.name
          }
          const snippetNew = (msg.snippet || '').trim() || ''
          const processedNew = await processIncomingEmailMedia(
            gmail,
            gmailMessageId,
            msg.payload,
            newTicket.id,
            companyFolderNew,
            textBodies.html || null,
            textBodies.plain || null,
            snippetNew
          )
          const finalDescription = processedNew.body || null
          if (processedNew.body !== body) {
            await db.update(tickets).set({ description: finalDescription, updatedAt: new Date() }).where(eq(tickets.id, newTicket.id))
          }
          if (processedNew.files.length > 0) {
            await db.insert(ticketAttachments).values(
              processedNew.files.map((f) => ({
                ticketId: newTicket.id,
                fileUrl: f.fileUrl,
                fileName: truncateVarchar(f.fileName, 2048),
                filePath: f.filePath,
                uploadedBy: creatorUserId ?? null,
              }))
            )
          }

          await logTicketActivity({
            ticketId: newTicket.id,
            actorUserId: creatorUserId ?? null,
            actorRole: creatorUserId ? 'customer' : 'system',
            action: 'ticket_created',
            metadata: {
              created_via: 'email',
              sender_email: senderEmail,
              title,
              attachment_count: processedNew.files.length,
            },
          })

          createdCount++
          if (isDebug) {
            debugLog.push({ email: senderEmail, subject: title, reason: `OK: new_ticket #${newTicket.id} company=${ticketCompanyId}` })
            console.log('[Sync] CREATED ticket #' + newTicket.id, senderEmail, title?.slice(0, 40))
          }
          sendAutomationLog({
            event: 'email_ticket_created',
            ticket_id: ticketId,
            email: senderEmail,
            subject: title,
            message: (processedNew.body || '').slice(0, 200) || '',
            detail: `company=${ticketCompanyId}`,
          }).catch(() => {})

          try {
            await runAutomationRules('ticket_created', {
              id: ticketId,
              title,
              description: finalDescription,
              status: 'to_do',
              priority_slug: null,
              company_id: ticketCompanyId,
              created_via: 'email',
              sender_email: senderEmail,
              sender_domain: senderDomain || null,
            })
          } catch (autoErr) {
            console.error('Automation rules error:', autoErr)
            sendAutomationLog({
              event: 'automation_error',
              ticket_id: ticketId,
              email: senderEmail,
              message: String(autoErr),
              detail: 'ticket_created',
            }).catch(() => {})
          }

          await db.update(emailMessages).set({ ticketId }).where(eq(emailMessages.gmailMessageId, gmailMessageId))
        }
      }

      alreadyProcessed.add(gmailMessageId)
      addedCount++
    }

    await db
      .update(emailIntegrations)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(emailIntegrations.id, integration.id))

    if (isDebug) {
      console.log('[Sync] DONE | added:', addedCount, 'created:', createdCount, 'skipped:', skippedClaimFailed + skippedCompanyMismatch, 'debugLog:', debugLog.length)
    }

    return NextResponse.json({
      success: true,
      addedCount,
      createdCount,
      lastSyncAt: new Date().toISOString(),
      totalFromGmail: messages.length,
      newToProcess: fetched.length,
      ...(isDebug && {
        _debug: {
          skippedClaimFailed,
          skippedCompanyMismatch,
          skippedDetails: debugLog,
        },
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
