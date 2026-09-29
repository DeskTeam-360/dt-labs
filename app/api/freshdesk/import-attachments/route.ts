import { and, eq, gte, lte } from 'drizzle-orm'
import { NextRequest } from 'next/server'

import { auth } from '@/auth'
import { appSettings, db, tickets } from '@/lib/db'
import { type FdAttachment, importFdTicketAttachments } from '@/lib/freshdesk-attachments'

function freshdeskAuthHeader(apiKey: string) {
  return 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')
}

type FDConversation = { id: number; attachments?: FdAttachment[] }

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
          const tdRes = await fetch(`${baseUrl}/api/v2/tickets/${ticketId}`, {
            headers: { Authorization: authHeader },
          })
          if (!tdRes.ok) {
            send({ type: 'att_error', ticketId, file: null, reason: `FD ticket fetch failed: ${tdRes.status}` })
          }
          const td = tdRes.ok ? ((await tdRes.json()) as { attachments?: FdAttachment[] }) : null

          const conversations: FDConversation[] = []
          for (let page = 1; ; page++) {
            const cvRes = await fetch(
              `${baseUrl}/api/v2/tickets/${ticketId}/conversations?page=${page}&per_page=100`,
              { headers: { Authorization: authHeader } }
            )
            if (!cvRes.ok) {
              send({ type: 'att_error', ticketId, file: null, reason: `conversations fetch failed: ${cvRes.status}` })
              break
            }
            const batch = (await cvRes.json()) as FDConversation[]
            if (!Array.isArray(batch) || batch.length === 0) break
            conversations.push(...batch)
            if (batch.length < 100) break
          }

          const r = await importFdTicketAttachments({
            ticketId,
            ticketFiles: td?.attachments ?? [],
            conversations,
            authHeader,
          })
          attachmentsImported += r.imported
          attachmentsSkipped += r.skipped
          attachmentsError += r.failed
          for (const err of r.errors) send({ type: 'att_error', ticketId, file: err.file, reason: err.reason })

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
