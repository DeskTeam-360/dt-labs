import { eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin, isAdminOrManager } from '@/lib/auth-utils'
import { db, ticketComments, tickets, users } from '@/lib/db'
import { FD_STATUS_MAP, FD_TYPE_MAP } from '@/lib/freshdesk-maps'

function freshdeskAuthHeader(apiKey: string) {
  return 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')
}

async function fetchPages<T>(url: string, authHeader: string): Promise<T[]> {
  const results: T[] = []
  let page = 1
  while (true) {
    const params = new URLSearchParams({ page: String(page), per_page: '100' })
    const res = await fetch(`${url}?${params}`, {
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    })
    if (!res.ok) break
    const data = await res.json() as T[]
    if (!Array.isArray(data) || data.length === 0) break
    results.push(...data)
    if (data.length < 100) break
    page++
  }
  return results
}

async function fetchOne<T>(url: string, authHeader: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
  })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

type FDConversation = {
  id: number
  body: string
  body_text: string | null
  incoming: boolean
  private: boolean
  from_email: string | null
  created_at: string
}

type FDTicket = {
  id: number
  subject: string
  description?: string | null
  description_text?: string | null
  status: number
  type: string | null
  requester_id: number
  created_at: string
  updated_at: string
}

type FDAgent = { id: number; contact: { name: string; email: string } }

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string }).role?.toLowerCase() ?? ''
  if (!isAdmin({ role }) && !isAdminOrManager({ role })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const ticketId: number | undefined = body.ticket_id
  if (!ticketId) return NextResponse.json({ error: 'ticket_id required' }, { status: 400 })

  // Load FD credentials from app_settings
  const settingsRows = await db.execute(
    sql`SELECT key, value FROM app_settings WHERE key IN ('freshdesk_domain', 'freshdesk_api_key')`
  )
  const map: Record<string, string> = {}
  for (const row of settingsRows.rows as { key: string; value: string }[]) {
    map[row.key] = row.value
  }
  const fdDomain = map['freshdesk_domain'] ?? ''
  const apiKey = map['freshdesk_api_key'] ?? ''
  if (!fdDomain || !apiKey) {
    return NextResponse.json({ error: 'Freshdesk not configured' }, { status: 400 })
  }
  const baseUrl = `https://${fdDomain}`
  const authHeader = freshdeskAuthHeader(apiKey)

  // Fetch ticket from FD
  const ft = await fetchOne<FDTicket>(`${baseUrl}/api/v2/tickets/${ticketId}`, authHeader)
  if (!ft) return NextResponse.json({ error: 'Ticket not found in Freshdesk' }, { status: 404 })

  // Update ticket fields
  const mappedStatus = FD_STATUS_MAP[ft.status] ?? 'open'
  const mappedTypeId = ft.type ? (FD_TYPE_MAP[ft.type] ?? null) : null

  await db.update(tickets).set({
    title: ft.subject?.trim() || '(no subject)',
    description: ft.description ?? ft.description_text ?? null,
    status: mappedStatus,
    typeId: mappedTypeId,
    source: 'freshdesk',
    updatedAt: new Date(),
  }).where(eq(tickets.id, ticketId))

  // Fetch & sync conversations
  const result = { comments: { imported: 0, skipped: 0, errors: 0 } }

  // Build agent name map
  const fdAgentNameByEmail: Record<string, string> = {}
  try {
    const agents = await fetchPages<FDAgent>(`${baseUrl}/api/v2/agents`, authHeader)
    for (const a of agents) {
      if (a.contact?.email) fdAgentNameByEmail[a.contact.email.toLowerCase()] = a.contact.name
    }
  } catch { /* non-fatal */ }

  const emailToUserId: Record<string, string> = {}

  const conversations = await fetchPages<FDConversation>(
    `${baseUrl}/api/v2/tickets/${ticketId}/conversations`,
    authHeader,
  ).catch(() => [] as FDConversation[])

  const adminUserId = session.user.id!

  for (const conv of conversations) {
    try {
      const fromEmail = conv.from_email?.trim().toLowerCase()
      let commentUserId = adminUserId

      if (fromEmail) {
        if (emailToUserId[fromEmail]) {
          commentUserId = emailToUserId[fromEmail]
        } else {
          const found = await db.select({ id: users.id, role: users.role })
            .from(users).where(eq(users.email, fromEmail)).limit(1)
          if (found.length > 0) {
            commentUserId = found[0].id
            emailToUserId[fromEmail] = found[0].id
          } else if (!conv.incoming) {
            const agentName = fdAgentNameByEmail[fromEmail]
            const fullName = agentName ? `FD - ${agentName}` : `FD - ${fromEmail}`
            const nameParts = fullName.split(' ')
            const [ins] = await db.insert(users).values({
              email: fromEmail, fullName,
              firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || null,
              role: 'agent', status: 'inactive',
            }).returning({ id: users.id })
            commentUserId = ins.id
            emailToUserId[fromEmail] = ins.id
          }
        }
      }

      const bodyHtml = conv.body?.trim() || ''
      const commentText = conv.body_text?.trim() || bodyHtml.replace(/<[^>]+>/g, '').trim() || ''
      if (!bodyHtml && !commentText) { result.comments.skipped++; continue }

      const inserted = await db.insert(ticketComments).values({
        ticketId,
        userId: commentUserId,
        comment: bodyHtml || commentText,
        visibility: conv.private ? 'note' : 'public',
        authorType: conv.incoming ? 'customer' : 'agent',
        createdAt: new Date(conv.created_at),
        receivedAt: new Date(conv.created_at),
        fdConversationId: conv.id,
      }).onConflictDoNothing({ target: [ticketComments.fdConversationId] }).returning({ id: ticketComments.id })

      if (inserted.length > 0) result.comments.imported++
      else result.comments.skipped++
    } catch { result.comments.errors++ }
  }

  return NextResponse.json({ ok: true, comments: result.comments })
}
