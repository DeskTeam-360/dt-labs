import { and, eq, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { appSettings, companies, companyUsers, db, ticketComments, tickets, users } from '@/lib/db'
import { FD_STATUS_MAP, FD_TYPE_MAP } from '@/lib/freshdesk-maps'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role ?? ''
}

async function getFreshdeskSettings() {
  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']))
  return {
    domain: map['freshdesk_domain'] ?? '',
    apiKey: map['freshdesk_api_key'] ?? '',
  }
}

function freshdeskAuthHeader(apiKey: string) {
  return 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')
}

async function fetchPages<T>(url: string, authHeader: string, extraParams: Record<string, string> = {}): Promise<T[]> {
  const results: T[] = []
  let page = 1
  while (true) {
    const params = new URLSearchParams({ page: String(page), per_page: '100', ...extraParams })
    const res = await fetch(`${url}?${params}`, {
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    })
    if (!res.ok) break
    const data = (await res.json()) as T[]
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

type FreshdeskCompany = { id: number; name: string; domains?: string[] }

type FreshdeskAgent = { id: number; contact: { name: string; email: string } }

type FreshdeskContact = {
  id: number
  name: string
  email: string | null
  company_id: number | null
  phone?: string | null
  mobile?: string | null
}

type FreshdeskTicket = {
  id: number
  subject: string
  description: string | null        // HTML
  description_text: string | null   // plain text
  status: number                    // 2=open 3=pending 4=resolved 5=closed + custom
  priority: number                  // 1=low 2=medium 3=high 4=urgent
  type: string | null               // FD type string e.g. "Design", "Question"
  requester_id: number
  company_id: number | null
  created_at: string
  updated_at: string
}

type FreshdeskConversation = {
  id: number
  body: string                      // HTML
  body_text: string | null
  incoming: boolean                 // true = from customer
  private: boolean                  // true = internal note
  from_email: string | null
  created_at: string
}

// Reset postgres identity sequence after bulk insert with overriding ids
async function resetTicketSequence() {
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('tickets','id'), COALESCE((SELECT MAX(id) FROM tickets), 0))`)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionRole(session).toLowerCase() !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminUserId = (session.user as { id: string }).id

  const body = await req.json().catch(() => ({}))
  const importContacts: boolean = body.import_contacts !== false
  const importTickets: boolean = body.import_tickets === true
  const limitCompanies: number | null = typeof body.limit_companies === 'number' ? body.limit_companies : null
  const limitTickets: number | null = typeof body.limit_tickets === 'number' ? body.limit_tickets : null

  const { domain, apiKey } = await getFreshdeskSettings()
  if (!domain || !apiKey) {
    return NextResponse.json({ error: 'Freshdesk domain and API key are required. Configure them in settings first.' }, { status: 400 })
  }

  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`
  const authHeader = freshdeskAuthHeader(apiKey)

  const result = {
    companies: { imported: 0, skipped: 0, errors: 0 },
    contacts: { imported: 0, skipped: 0, errors: 0 },
    tickets: { imported: 0, skipped: 0, errors: 0 },
    comments: { imported: 0, skipped: 0, errors: 0 },
  }
  let firstTicketError: string | null = null

  // ── 0a. Fetch Freshdesk agents → email:name map for comment attribution ─
  const fdAgentNameByEmail: Record<string, string> = {}
  try {
    const agents = await fetchPages<FreshdeskAgent>(`${baseUrl}/api/v2/agents`, authHeader)
    for (const a of agents) {
      if (a.contact?.email) fdAgentNameByEmail[a.contact.email.toLowerCase()] = a.contact.name
    }
  } catch { /* non-fatal */ }

  // ── 1. Fetch Companies from Freshdesk ─────────────────────────────
  let fdCompanies: FreshdeskCompany[] = []
  try {
    fdCompanies = await fetchPages<FreshdeskCompany>(`${baseUrl}/api/v2/companies`, authHeader)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch companies from Freshdesk. Check domain and API key.' }, { status: 502 })
  }
  if (limitCompanies) fdCompanies = fdCompanies.slice(0, limitCompanies)

  // ── 2. Import each company, then its contacts and tickets ─────────
  for (const fc of fdCompanies) {
    let ourCompanyId: string | null = null

    // — Company —
    try {
      const name = fc.name?.trim()
      if (!name) { result.companies.skipped++; continue }

      const existing = await db.select({ id: companies.id, freshdeskId: companies.freshdeskId })
        .from(companies)
        .where(eq(companies.name, name))
        .limit(1)

      if (existing.length > 0) {
        ourCompanyId = existing[0].id
        if (!existing[0].freshdeskId) {
          await db.update(companies).set({ freshdeskId: fc.id }).where(eq(companies.id, ourCompanyId))
        }
        result.companies.skipped++
      } else {
        const [inserted] = await db.insert(companies).values({
          name,
          isCustomer: true,
          domainList: fc.domains ?? [],
          color: '#1890ff',
          freshdeskId: fc.id,
        }).returning({ id: companies.id })
        ourCompanyId = inserted.id
        result.companies.imported++
      }
    } catch {
      result.companies.errors++
      continue
    }

    if (!ourCompanyId) continue

    // Maps freshdesk contact id → our user uuid (built during contact import)
    const fdContactIdToOurUserId: Record<number, string> = {}
    // Email → our user uuid cache (for comment lookup)
    const emailToUserId: Record<string, string> = {}
    // Cached first customer in this company — fallback for unknown customer comments
    let companyFallbackUserId: string | null = null

    // — Contacts —
    if (importContacts) {
      let fdContacts: FreshdeskContact[] = []
      try {
        fdContacts = await fetchPages<FreshdeskContact>(
          `${baseUrl}/api/v2/contacts`,
          authHeader,
          { company_id: String(fc.id) },
        )
      } catch {
        result.contacts.errors++
      }

      for (const contact of fdContacts) {
        try {
          const email = contact.email?.trim().toLowerCase()
          if (!email) { result.contacts.skipped++; continue }

          const existingUser = await db.select({ id: users.id, companyId: users.companyId })
            .from(users)
            .where(eq(users.email, email))
            .limit(1)

          if (existingUser.length > 0) {
            fdContactIdToOurUserId[contact.id] = existingUser[0].id
            emailToUserId[email] = existingUser[0].id
            if (!existingUser[0].companyId) {
              await db.update(users).set({ companyId: ourCompanyId, updatedAt: new Date() }).where(eq(users.id, existingUser[0].id))
              await db.insert(companyUsers).values({ companyId: ourCompanyId, userId: existingUser[0].id, companyRole: 'member' }).onConflictDoNothing()
            }
            result.contacts.skipped++
            continue
          }

          const nameParts = (contact.name || '').trim().split(' ')
          const [inserted] = await db.insert(users).values({
            email,
            fullName: contact.name?.trim() || email,
            firstName: nameParts[0] ?? '',
            lastName: nameParts.slice(1).join(' ') || null,
            role: 'customer',
            status: 'active',
            companyId: ourCompanyId,
            phone: contact.phone ?? contact.mobile ?? null,
          }).returning({ id: users.id })

          await db.insert(companyUsers).values({ companyId: ourCompanyId, userId: inserted.id, companyRole: 'member' }).onConflictDoNothing()

          fdContactIdToOurUserId[contact.id] = inserted.id
          emailToUserId[email] = inserted.id
          result.contacts.imported++
        } catch {
          result.contacts.errors++
        }
      }
    }

    // — Tickets —
    if (importTickets) {
      let fdTickets: FreshdeskTicket[] = []
      try {
        fdTickets = await fetchPages<FreshdeskTicket>(
          `${baseUrl}/api/v2/tickets`,
          authHeader,
          { company_id: String(fc.id) },
        )
      } catch {
        result.tickets.errors++
      }
      if (limitTickets) fdTickets = fdTickets.slice(0, limitTickets)

      for (const ft of fdTickets) {
        try {
          // Check if ticket already exists with this Freshdesk ID
          const existingTicket = await db.select({ id: tickets.id })
            .from(tickets)
            .where(eq(tickets.id, ft.id))
            .limit(1)

          if (existingTicket.length > 0) {
            result.tickets.skipped++
            continue
          }

          // Resolve requester → our user UUID; verify it exists to avoid FK violation
          let contactUserId: string | null = fdContactIdToOurUserId[ft.requester_id] ?? null
          if (contactUserId) {
            const exists = await db.select({ id: users.id }).from(users).where(eq(users.id, contactUserId)).limit(1)
            if (exists.length === 0) contactUserId = null
          }
          const createdBy = contactUserId ?? adminUserId

          // Freshdesk list endpoint omits description — fetch detail to get it
          let description: string | null = ft.description ?? ft.description_text ?? null
          let descriptionText: string | null = ft.description_text ?? null
          if (!description) {
            const detail = await fetchOne<FreshdeskTicket>(`${baseUrl}/api/v2/tickets/${ft.id}`, authHeader)
            if (detail) {
              description = detail.description ?? detail.description_text ?? null
              descriptionText = detail.description_text ?? null
            }
          }

          const mappedStatus = FD_STATUS_MAP[ft.status] ?? 'open'
          const mappedTypeId = ft.type ? (FD_TYPE_MAP[ft.type] ?? null) : null

          // INSERT OVERRIDING SYSTEM VALUE to preserve Freshdesk ticket ID
          // Note: dates must be ISO strings — postgres.js can't serialize Date in sql`` templates
          await db.execute(sql`
            INSERT INTO tickets (
              id, title, description, original_description,
              status, type_id, priority, company_id,
              contact_user_id, created_by,
              created_via,
              created_at, updated_at
            )
            OVERRIDING SYSTEM VALUE
            VALUES (
              ${ft.id},
              ${ft.subject?.trim() || '(no subject)'},
              ${description},
              ${descriptionText},
              ${mappedStatus},
              ${mappedTypeId},
              ${null},
              ${ourCompanyId}::uuid,
              ${contactUserId}::uuid,
              ${createdBy}::uuid,
              ${'freshdesk'},
              ${new Date(ft.created_at).toISOString()}::timestamptz,
              ${new Date(ft.updated_at).toISOString()}::timestamptz
            )
          `)

          result.tickets.imported++

          // — Conversations (comments) —
          let conversations: FreshdeskConversation[] = []
          try {
            conversations = await fetchPages<FreshdeskConversation>(
              `${baseUrl}/api/v2/tickets/${ft.id}/conversations`,
              authHeader,
            )
          } catch {
            // Non-fatal
          }

          for (const conv of conversations) {
            try {
              // Resolve user: from_email → DB lookup → create placeholder (never fall back to admin)
              let commentUserId = adminUserId
              const fromEmail = conv.from_email?.trim().toLowerCase()
              if (fromEmail) {
                if (emailToUserId[fromEmail]) {
                  commentUserId = emailToUserId[fromEmail]
                } else {
                  const found = await db.select({ id: users.id, role: users.role })
                    .from(users).where(eq(users.email, fromEmail)).limit(1)
                  if (found.length > 0 && found[0].role !== 'admin') {
                    commentUserId = found[0].id
                    emailToUserId[fromEmail] = found[0].id
                  } else if (found.length === 0 && !conv.incoming) {
                    // Agent reply → inactive placeholder with FD- prefix
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
                  // Unknown customer email or admin found → fall through to company fallback below
                }
              }

              // If still on adminUserId and it's a customer comment → use first customer in this company
              if (commentUserId === adminUserId && conv.incoming && ourCompanyId) {
                if (companyFallbackUserId) {
                  commentUserId = companyFallbackUserId
                } else {
                  const firstCustomer = await db.select({ id: users.id })
                    .from(users)
                    .where(and(eq(users.companyId, ourCompanyId), eq(users.role, 'customer')))
                    .limit(1)
                  if (firstCustomer.length > 0) {
                    companyFallbackUserId = firstCustomer[0].id
                    commentUserId = firstCustomer[0].id
                  }
                }
              }

              const visibility = conv.private ? 'note' : 'public'
              const authorType = conv.incoming ? 'customer' : 'agent'
              const bodyHtml = conv.body?.trim() || ''
              const commentText = conv.body_text?.trim() || bodyHtml.replace(/<[^>]+>/g, '').trim() || ''
              if (!bodyHtml && !commentText) { result.comments.skipped++; continue }

              const inserted = await db.insert(ticketComments).values({
                ticketId: ft.id,
                userId: commentUserId,
                comment: bodyHtml || commentText,
                visibility,
                authorType,
                createdAt: new Date(conv.created_at),
                receivedAt: new Date(conv.created_at),
                fdConversationId: conv.id,
              }).onConflictDoNothing({ target: [ticketComments.fdConversationId] }).returning({ id: ticketComments.id })

              if (inserted.length > 0) result.comments.imported++
              else result.comments.skipped++
            } catch {
              result.comments.errors++
            }
          }
        } catch (e) {
          result.tickets.errors++
          if (!firstTicketError) {
            firstTicketError = String((e as Error)?.message ?? e)
            console.error('[FD Import] Ticket insert error (fd_id=' + ft.id + '):', e)
          }
        }
      }
    }
  }

  // Reset identity sequence so new tickets get correct next ID
  if (importTickets && result.tickets.imported > 0) {
    try { await resetTicketSequence() } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, result, firstTicketError })
}
