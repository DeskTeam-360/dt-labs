import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { appSettings, companies, companyUsers, db, ticketComments, tickets, users } from '@/lib/db'

function sessionRole(s: { user?: { role?: string } } | null) {
  return (s?.user as { role?: string } | undefined)?.role ?? ''
}

async function getFreshdeskSettings() {
  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']))
  return { domain: map['freshdesk_domain'] ?? '', apiKey: map['freshdesk_api_key'] ?? '' }
}

function authHeader(apiKey: string) {
  return 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')
}

class FreshdeskRateLimitError extends Error {
  retryAfter: number
  constructor(retryAfter: number) {
    super(`Freshdesk rate limit hit — retry after ${retryAfter}s`)
    this.retryAfter = retryAfter
  }
}

async function fetchPages<T>(url: string, auth: string, extra: Record<string, string> = {}): Promise<T[]> {
  const results: T[] = []
  let page = 1
  while (true) {
    const params = new URLSearchParams({ page: String(page), per_page: '100', ...extra })
    const res = await fetch(`${url}?${params}`, { headers: { Authorization: auth, 'Content-Type': 'application/json' } })
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 60)
      throw new FreshdeskRateLimitError(retryAfter)
    }
    if (!res.ok) break
    const data = (await res.json()) as T[]
    if (!Array.isArray(data) || data.length === 0) break
    results.push(...data)
    if (data.length < 100) break
    page++
  }
  return results
}

async function fetchOne<T>(url: string, auth: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Authorization: auth, 'Content-Type': 'application/json' } })
  if (!res.ok) return null
  return res.json() as Promise<T>
}

type FDContact = { id: number; name: string; email: string | null; phone?: string | null; mobile?: string | null }
type FDTicket = { id: number; subject: string; description?: string | null; description_text?: string | null; status: number; requester_id: number; created_at: string; updated_at: string }
type FDConversation = { id: number; body: string; body_text: string | null; incoming: boolean; private: boolean; from_email: string | null; created_at: string }
type FDAgent = { id: number; contact: { name: string; email: string } }

function mapStatus(fd: number): string {
  if (fd === 3) return 'pending'
  if (fd === 4) return 'resolved'
  if (fd === 5) return 'closed'
  return 'open'
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = sessionRole(session).toLowerCase()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const companyId: string = body.company_id
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  const ticketsSince: string | null = body.tickets_since ?? null
  const ticketsUntil: string | null = body.tickets_until ?? null

  const { domain, apiKey } = await getFreshdeskSettings()
  if (!domain || !apiKey) return NextResponse.json({ error: 'Freshdesk settings not configured' }, { status: 400 })

  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`
  const auth_ = authHeader(apiKey)

  // Load company
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  if (!company.freshdeskId) return NextResponse.json({ error: 'This company has no Freshdesk ID. Import it via Freshdesk Import first.' }, { status: 400 })

  const fdCompanyId = company.freshdeskId
  const result = { contacts: { imported: 0, skipped: 0, errors: 0 }, tickets: { imported: 0, skipped: 0, errors: 0 }, comments: { imported: 0, skipped: 0, errors: 0 } }

  // ── Contacts ──────────────────────────────────────────────────────
  const fdContacts = await fetchPages<FDContact>(`${baseUrl}/api/v2/contacts`, auth_, { company_id: String(fdCompanyId) })
  const emailToUserId: Record<string, string> = {}

  for (const fc of fdContacts) {
    try {
      const email = fc.email?.trim().toLowerCase()
      if (!email) { result.contacts.skipped++; continue }

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
      if (existing.length > 0) {
        emailToUserId[email] = existing[0].id
        result.contacts.skipped++
        continue
      }

      const nameParts = (fc.name || '').trim().split(' ')
      const [inserted] = await db.insert(users).values({
        email,
        fullName: fc.name?.trim() || email,
        firstName: nameParts[0] ?? '',
        lastName: nameParts.slice(1).join(' ') || null,
        role: 'customer',
        status: 'active',
        companyId,
        phone: fc.phone ?? fc.mobile ?? null,
      }).returning({ id: users.id })

      await db.insert(companyUsers).values({ companyId, userId: inserted.id, companyRole: 'member' }).onConflictDoNothing()
      emailToUserId[email] = inserted.id
      result.contacts.imported++
    } catch {
      result.contacts.errors++
    }
  }

  // ── Admin user for fallback ────────────────────────────────────────
  const adminEmail = (session.user as { email?: string | null }).email ?? ''
  const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1)
  const adminUserId = adminUser?.id ?? null

  // ── FD Agents map ─────────────────────────────────────────────────
  const fdAgentNameByEmail: Record<string, string> = {}
  try {
    const agents = await fetchPages<FDAgent>(`${baseUrl}/api/v2/agents`, auth_)
    for (const a of agents) {
      if (a.contact?.email) fdAgentNameByEmail[a.contact.email.toLowerCase()] = a.contact.name
    }
  } catch { /* non-fatal */ }

  // First customer in company for fallback
  let companyFallbackUserId: string | null = null
  const firstCustomer = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.companyId, companyId), eq(users.role, 'customer'))).limit(1)
  if (firstCustomer.length > 0) companyFallbackUserId = firstCustomer[0].id

  // ── Tickets ───────────────────────────────────────────────────────
  const ticketParams: Record<string, string> = { company_id: String(fdCompanyId) }
  if (ticketsSince) ticketParams['updated_since'] = ticketsSince
  let fdTickets: FDTicket[]
  try {
    fdTickets = await fetchPages<FDTicket>(`${baseUrl}/api/v2/tickets`, auth_, ticketParams)
  } catch (e) {
    if (e instanceof FreshdeskRateLimitError) {
      return NextResponse.json({ error: `Freshdesk rate limit tercapai. Coba lagi dalam ${e.retryAfter} detik.`, rate_limited: true, retry_after: e.retryAfter }, { status: 429 })
    }
    return NextResponse.json({ error: 'Gagal mengambil ticket dari Freshdesk.' }, { status: 502 })
  }
  // Filter by end date client-side (Freshdesk API doesn't support updated_before)
  if (ticketsUntil) {
    const until = new Date(ticketsUntil)
    fdTickets = fdTickets.filter((t) => new Date(t.updated_at) <= until)
  }

  for (const ft of fdTickets) {
    try {
      const existing = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, ft.id)).limit(1)
      if (existing.length > 0) { result.tickets.skipped++; continue }

      // Resolve contact
      let contactUserId: string | null = null
      // Try looking up requester by fetching FD contact
      try {
        const fdContact = await fetchOne<FDContact>(`${baseUrl}/api/v2/contacts/${ft.requester_id}`, auth_)
        if (fdContact?.email) {
          const em = fdContact.email.trim().toLowerCase()
          contactUserId = emailToUserId[em] ?? null
          if (!contactUserId) {
            const found = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, em)).limit(1)
            if (found.length > 0 && found[0].role !== 'admin') contactUserId = found[0].id
          }
        }
      } catch { /* non-fatal */ }

      if (contactUserId) {
        const check = await db.select({ id: users.id }).from(users).where(eq(users.id, contactUserId)).limit(1)
        if (check.length === 0) contactUserId = null
      }

      let description: string | null = ft.description ?? ft.description_text ?? null
      let descText: string | null = ft.description_text ?? null
      if (!description) {
        const detail = await fetchOne<FDTicket>(`${baseUrl}/api/v2/tickets/${ft.id}`, auth_)
        if (detail) { description = detail.description ?? detail.description_text ?? null; descText = detail.description_text ?? null }
      }

      await db.execute(sql`
        INSERT INTO tickets (id, title, description, original_description, status, priority, company_id, contact_user_id, created_by, created_via, created_at, updated_at)
        OVERRIDING SYSTEM VALUE
        VALUES (${ft.id}, ${ft.subject?.trim() || '(no subject)'}, ${description}, ${descText}, ${mapStatus(ft.status)}, ${null}, ${companyId}::uuid, ${contactUserId}::uuid, ${contactUserId ?? adminUserId}::uuid, ${'freshdesk'}, ${new Date(ft.created_at).toISOString()}::timestamptz, ${new Date(ft.updated_at).toISOString()}::timestamptz)
      `)
      result.tickets.imported++

      // ── Conversations ──────────────────────────────────────────────
      let conversations: FDConversation[] = []
      try {
        const convData = await fetchOne<FDConversation[]>(`${baseUrl}/api/v2/tickets/${ft.id}/conversations`, auth_)
        conversations = Array.isArray(convData) ? convData : []
      } catch { /* non-fatal */ }

      for (const conv of conversations) {
        try {
          const fromEmail = conv.from_email?.trim().toLowerCase()
          let commentUserId = adminUserId

          if (fromEmail) {
            if (emailToUserId[fromEmail]) {
              commentUserId = emailToUserId[fromEmail]
            } else {
              const found = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, fromEmail)).limit(1)
              if (found.length > 0 && found[0].role !== 'admin') {
                commentUserId = found[0].id
                emailToUserId[fromEmail] = found[0].id
              } else if (found.length === 0 && !conv.incoming) {
                const agentName = fdAgentNameByEmail[fromEmail]
                const fullName = agentName ? `FD - ${agentName}` : `FD - ${fromEmail}`
                const parts = fullName.split(' ')
                const [ins] = await db.insert(users).values({ email: fromEmail, fullName, firstName: parts[0], lastName: parts.slice(1).join(' ') || null, role: 'agent', status: 'inactive' }).returning({ id: users.id })
                commentUserId = ins.id
                emailToUserId[fromEmail] = ins.id
              }
            }
          }

          if (commentUserId === adminUserId && conv.incoming && companyFallbackUserId) {
            commentUserId = companyFallbackUserId
          }

          const commentText = conv.body_text?.trim() || conv.body?.replace(/<[^>]+>/g, '').trim() || ''
          if (!commentText) { result.comments.skipped++; continue }

          await db.insert(ticketComments).values({
            ticketId: ft.id,
            userId: commentUserId ?? adminUserId!,
            comment: conv.body || commentText,
            visibility: conv.private ? 'note' : 'public',
            authorType: conv.incoming ? 'customer' : 'agent',
            createdAt: new Date(conv.created_at),
            receivedAt: new Date(conv.created_at),
          })
          result.comments.imported++
        } catch { result.comments.errors++ }
      }
    } catch {
      result.tickets.errors++
    }
  }

  return NextResponse.json({ ok: true, result })
}
