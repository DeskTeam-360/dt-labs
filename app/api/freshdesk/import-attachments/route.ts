import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { NextRequest } from 'next/server'

import { auth } from '@/auth'
import { appSettings, commentAttachments, db, ticketAttachments, ticketComments, tickets } from '@/lib/db'
import { uploadBuffer } from '@/lib/storage-idrive'

function freshdeskAuthHeader(apiKey: string) {
  return 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')
}

type FDAttachment = {
  id: number
  name: string
  attachment_url: string
  content_type: string
  size: number
}

type FDTicketDetail = {
  id: number
  attachments?: FDAttachment[]
}

type FDConversation = {
  id: number
  attachments?: FDAttachment[]
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200)
}

async function downloadAttachment(url: string, authHeader: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader } })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const arrayBuffer = await res.arrayBuffer()
    return { buffer: Buffer.from(arrayBuffer), contentType }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }
  const role = (session.user as { role?: string }).role?.toLowerCase() ?? ''
  if (role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const fromId: number = typeof body.from_ticket_id === 'number' ? body.from_ticket_id : 1
  const toId: number = typeof body.to_ticket_id === 'number' ? body.to_ticket_id : 99999999

  const settingsRows = await db.select().from(appSettings)
  const map = Object.fromEntries(settingsRows.map((r) => [r.key, r.value ?? '']))
  const fdDomain = map['freshdesk_domain'] ?? ''
  const apiKey = map['freshdesk_api_key'] ?? ''
  if (!fdDomain || !apiKey) {
    return new Response(JSON.stringify({ error: 'Freshdesk not configured' }), { status: 400 })
  }
  const baseUrl = fdDomain.startsWith('http') ? fdDomain : `https://${fdDomain}`
  const authHeader = freshdeskAuthHeader(apiKey)

  // Fetch tickets from our DB in range that came from Freshdesk
  const fdTickets = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.source, 'freshdesk'),
        gte(tickets.id, fromId),
        lte(tickets.id, toId),
      )
    )
    .orderBy(tickets.id)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(line: object) {
        controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))
      }

      send({ type: 'start', total: fdTickets.length, from: fromId, to: toId })

      let attachmentsImported = 0
      let attachmentsSkipped = 0
      let attachmentsError = 0

      for (const { id: ticketId } of fdTickets) {
        try {
          // ── Ticket-level attachments ────────────────────────────
          const tdRes = await fetch(`${baseUrl}/api/v2/tickets/${ticketId}`, {
            headers: { Authorization: authHeader },
          })
          if (tdRes.ok) {
            const td = await tdRes.json() as FDTicketDetail
            for (const att of td.attachments ?? []) {
              // Skip if already imported (match by ticketId + fileName)
              const existing = await db
                .select({ id: ticketAttachments.id })
                .from(ticketAttachments)
                .where(
                  and(
                    eq(ticketAttachments.ticketId, ticketId),
                    eq(ticketAttachments.fileName, att.name),
                  )
                )
                .limit(1)
              if (existing.length > 0) { attachmentsSkipped++; continue }

              const downloaded = await downloadAttachment(att.attachment_url, authHeader)
              if (!downloaded) {
                attachmentsError++
                send({ type: 'att_error', ticketId, file: att.name, reason: 'download failed' })
                continue
              }

              const safeName = sanitizeFileName(att.name)
              const path = `freshdesk/attachments/tickets/${ticketId}/${att.id}_${safeName}`
              const { url: fileUrl, error: uploadErr } = await uploadBuffer(path, downloaded.buffer, downloaded.contentType)
              if (!fileUrl) {
                attachmentsError++
                send({ type: 'att_error', ticketId, file: att.name, reason: `upload failed: ${uploadErr}` })
                continue
              }

              await db.insert(ticketAttachments).values({
                ticketId,
                fileUrl,
                fileName: att.name,
                filePath: path,
              })
              attachmentsImported++
            }
          } else {
            send({ type: 'att_error', ticketId, file: null, reason: `FD ticket fetch failed: ${tdRes.status}` })
          }

          // ── Conversation attachments ───────────────────────────
          let page = 1
          while (true) {
            const cvRes = await fetch(
              `${baseUrl}/api/v2/tickets/${ticketId}/conversations?page=${page}&per_page=100`,
              { headers: { Authorization: authHeader } }
            )
            if (!cvRes.ok) {
              send({ type: 'att_error', ticketId, file: null, reason: `conversations fetch failed: ${cvRes.status}` })
              break
            }
            const conversations = await cvRes.json() as FDConversation[]
            if (!Array.isArray(conversations) || conversations.length === 0) break

            for (const conv of conversations) {
              for (const att of conv.attachments ?? []) {
                // Find our comment that came from this FD conversation
                const commentRows = await db
                  .select({ id: ticketComments.id })
                  .from(ticketComments)
                  .where(
                    and(
                      eq(ticketComments.ticketId, ticketId),
                      sql`${ticketComments.fdConversationId} = ${conv.id}`
                    )
                  )
                  .limit(1)

                const commentId = commentRows[0]?.id ?? null

                if (commentId) {
                  // Skip if already imported for this comment + fileName
                  const existing = await db
                    .select({ id: commentAttachments.id })
                    .from(commentAttachments)
                    .where(
                      and(
                        eq(commentAttachments.commentId, commentId),
                        eq(commentAttachments.fileName, att.name),
                      )
                    )
                    .limit(1)
                  if (existing.length > 0) { attachmentsSkipped++; continue }
                }

                const downloaded = await downloadAttachment(att.attachment_url, authHeader)
                if (!downloaded) {
                  attachmentsError++
                  send({ type: 'att_error', ticketId, file: att.name, reason: 'download failed (conversation)' })
                  continue
                }

                const safeName = sanitizeFileName(att.name)
                const pathPrefix = commentId
                  ? `freshdesk/attachments/tickets/${ticketId}/comments/${commentId}`
                  : `freshdesk/attachments/tickets/${ticketId}/conversations/${conv.id}`
                const path = `${pathPrefix}/${att.id}_${safeName}`
                const { url: fileUrl, error: uploadErr } = await uploadBuffer(path, downloaded.buffer, downloaded.contentType)
                if (!fileUrl) {
                  attachmentsError++
                  send({ type: 'att_error', ticketId, file: att.name, reason: `upload failed: ${uploadErr}` })
                  continue
                }

                if (commentId) {
                  await db.insert(commentAttachments).values({
                    commentId,
                    fileUrl,
                    fileName: att.name,
                    filePath: path,
                  })
                } else {
                  // Conversation not in our DB yet — store as ticket attachment fallback
                  await db.insert(ticketAttachments).values({
                    ticketId,
                    fileUrl,
                    fileName: att.name,
                    filePath: path,
                  })
                }
                attachmentsImported++
              }
            }

            if (conversations.length < 100) break
            page++
          }

          send({ type: 'progress', ticketId, attachmentsImported, attachmentsSkipped, attachmentsError })
        } catch (e) {
          send({ type: 'error', ticketId, message: (e as Error).message })
        }
      }

      send({ type: 'done', attachmentsImported, attachmentsSkipped, attachmentsError, total: fdTickets.length })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
