import { and, eq, sql } from 'drizzle-orm'

import { appSettings, companies, companyUsers, db, ticketComments, tickets, users } from '@/lib/db'
import { type FdAttachment, type FdAttachmentImportResult, importFdTicketAttachments } from '@/lib/freshdesk-attachments'
import { FD_STATUS_MAP, FD_TYPE_MAP } from '@/lib/freshdesk-maps'

type FdTicket = {
  id: number
  subject: string
  description: string | null
  description_text: string | null
  status: number
  type: string | null
  requester_id: number
  company_id: number | null
  created_at: string
  updated_at: string
  attachments?: FdAttachment[]
}

type FdConversation = {
  id: number
  body: string
  body_text: string | null
  incoming: boolean
  private: boolean
  from_email: string | null
  created_at: string
  attachments?: FdAttachment[]
}

type FdCompany = { id: number; name: string; domains?: string[] }
type FdContact = { id: number; name: string; email: string | null; phone?: string | null; mobile?: string | null }
type FdAgent = { id: number; contact: { name: string; email: string } }

export type FdTicketImportStatus = 'imported' | 'already_imported' | 'not_found' | 'id_conflict' | 'error'

export type FdTicketImportResult = {
  ticketId: number
  status: FdTicketImportStatus
  message: string
  title?: string
  company?: string | null
  comments?: { imported: number; skipped: number; errors: number }
  attachments?: FdAttachmentImportResult
}

export type FdClient = {
  baseUrl: string
  authHeader: string
  get: <T>(path: string) => Promise<{ status: number; data: T | null }>
  getAll: <T>(path: string) => Promise<T[]>
}

export async function createFdClient(): Promise<FdClient | null> {
  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']))
  const domain = map['freshdesk_domain'] ?? ''
  const apiKey = map['freshdesk_api_key'] ?? ''
  if (!domain || !apiKey) return null
  const baseUrl = domain.startsWith('http') ? domain.replace(/\/+$/, '') : `https://${domain}`
  const authHeader = 'Basic ' + Buffer.from(`${apiKey}:X`).toString('base64')

  const get = async <T,>(path: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } })
      if (res.status === 429) {
        const wait = Math.min(60, Number(res.headers.get('retry-after')) || 30)
        await new Promise((r) => setTimeout(r, wait * 1000))
        continue
      }
      return { status: res.status, data: res.ok ? ((await res.json()) as T) : null }
    }
    return { status: 429, data: null }
  }

  const getAll = async <T,>(path: string) => {
    const out: T[] = []
    for (let page = 1; ; page++) {
      const sep = path.includes('?') ? '&' : '?'
      const { data } = await get<T[]>(`${path}${sep}per_page=100&page=${page}`)
      if (!Array.isArray(data) || data.length === 0) break
      out.push(...data)
      if (data.length < 100) break
    }
    return out
  }

  return { baseUrl, authHeader, get, getAll }
}

/** FD agent email → name, for naming placeholder agent users. Fetch once per batch. */
export async function loadFdAgentNames(fd: FdClient): Promise<Record<string, string>> {
  const names: Record<string, string> = {}
  try {
    for (const a of await fd.getAll<FdAgent>('/api/v2/agents')) {
      if (a.contact?.email) names[a.contact.email.toLowerCase()] = a.contact.name
    }
  } catch { /* names are cosmetic */ }
  return names
}

async function resolveCompany(fd: FdClient, fdCompanyId: number | null): Promise<{ id: string; name: string } | null> {
  if (!fdCompanyId) return null
  const [byFdId] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.freshdeskId, fdCompanyId))
    .limit(1)
  if (byFdId) return byFdId

  const { data: fc } = await fd.get<FdCompany>(`/api/v2/companies/${fdCompanyId}`)
  const name = fc?.name?.trim()
  if (!name) return null

  const [byName] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.name, name))
    .limit(1)
  if (byName) {
    await db.update(companies).set({ freshdeskId: fdCompanyId }).where(eq(companies.id, byName.id))
    return byName
  }

  const [created] = await db
    .insert(companies)
    .values({ name, isCustomer: true, domainList: fc?.domains ?? [], color: '#1890ff', freshdeskId: fdCompanyId })
    .returning({ id: companies.id, name: companies.name })
  return created ?? null
}

async function resolveRequester(fd: FdClient, requesterId: number, companyId: string | null): Promise<string | null> {
  if (!requesterId) return null
  const { data: contact } = await fd.get<FdContact>(`/api/v2/contacts/${requesterId}`)
  const email = contact?.email?.trim().toLowerCase()
  if (!email) return null

  const [existing] = await db
    .select({ id: users.id, companyId: users.companyId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (existing) {
    if (!existing.companyId && companyId) {
      await db.update(users).set({ companyId, updatedAt: new Date() }).where(eq(users.id, existing.id))
      await db.insert(companyUsers).values({ companyId, userId: existing.id, companyRole: 'member' }).onConflictDoNothing()
    }
    return existing.id
  }

  const nameParts = (contact?.name || '').trim().split(' ')
  const [created] = await db
    .insert(users)
    .values({
      email,
      fullName: contact?.name?.trim() || email,
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' ') || null,
      role: 'customer',
      status: 'active',
      companyId,
      phone: contact?.phone ?? contact?.mobile ?? null,
    })
    .returning({ id: users.id })
  if (created && companyId) {
    await db.insert(companyUsers).values({ companyId, userId: created.id, companyRole: 'member' }).onConflictDoNothing()
  }
  return created?.id ?? null
}

async function resolveCommentAuthor(params: {
  conv: FdConversation
  companyId: string | null
  contactUserId: string | null
  fallbackUserId: string
  agentNames: Record<string, string>
  cache: Record<string, string>
}): Promise<string> {
  const { conv, companyId, contactUserId, fallbackUserId, agentNames, cache } = params
  const email = conv.from_email?.trim().toLowerCase()

  if (email) {
    if (cache[email]) return cache[email]
    const [found] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (found) return (cache[email] = found.id)

    if (conv.incoming) {
      const displayName = email.split('@')[0] || 'Customer'
      const [created] = await db
        .insert(users)
        .values({ email, fullName: displayName, firstName: displayName, lastName: null, role: 'customer', status: 'active', companyId })
        .onConflictDoNothing()
        .returning({ id: users.id })
      if (created) {
        if (companyId) {
          await db.insert(companyUsers).values({ companyId, userId: created.id, companyRole: 'member' }).onConflictDoNothing()
        }
        return (cache[email] = created.id)
      }
    } else {
      const agentName = agentNames[email]
      const fullName = agentName ? `FD - ${agentName}` : `FD - ${email}`
      const parts = fullName.split(' ')
      const [created] = await db
        .insert(users)
        .values({ email, fullName, firstName: parts[0], lastName: parts.slice(1).join(' ') || null, role: 'agent', status: 'inactive' })
        .onConflictDoNothing()
        .returning({ id: users.id })
      if (created) return (cache[email] = created.id)
    }

    // Lost an insert race: the user exists now.
    const [retry] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (retry) return (cache[email] = retry.id)
  }

  if (conv.incoming && contactUserId) return contactUserId
  if (conv.incoming && companyId) {
    const [firstCustomer] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.role, 'customer')))
      .limit(1)
    if (firstCustomer) return firstCustomer.id
  }
  return fallbackUserId
}

/**
 * Imports one Freshdesk ticket (company, requester, ticket, conversations, attachments) keeping the FD ticket ID.
 * Never overwrites: an ID already used by a Freshdesk ticket is reported as already imported (use Resync),
 * and an ID used by a native ticket is reported as a conflict.
 */
export async function importFdTicketById(params: {
  fd: FdClient
  ticketId: number
  adminUserId: string
  agentNames: Record<string, string>
}): Promise<FdTicketImportResult> {
  const { fd, ticketId, adminUserId, agentNames } = params

  const [existing] = await db
    .select({ id: tickets.id, source: tickets.source, title: tickets.title })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)
  if (existing) {
    return existing.source === 'freshdesk'
      ? { ticketId, status: 'already_imported', title: existing.title, message: 'Already imported. Use Resync FD on the ticket to pull new replies.' }
      : { ticketId, status: 'id_conflict', title: existing.title, message: 'This ID is already used by a ticket created in DeskTeam360, so it was not overwritten.' }
  }

  const { status: httpStatus, data: ft } = await fd.get<FdTicket>(`/api/v2/tickets/${ticketId}?include=description`)
  if (httpStatus === 404) return { ticketId, status: 'not_found', message: 'Ticket not found in Freshdesk.' }
  if (!ft) return { ticketId, status: 'error', message: `Freshdesk returned HTTP ${httpStatus}.` }

  const company = await resolveCompany(fd, ft.company_id)
  const contactUserId = await resolveRequester(fd, ft.requester_id, company?.id ?? null)
  const createdBy = contactUserId ?? adminUserId

  // Keep the Freshdesk ID. Dates as ISO strings: postgres.js can't serialize Date inside sql``.
  await db.execute(sql`
    INSERT INTO tickets (
      id, title, description, original_description,
      status, type_id, priority, company_id,
      contact_user_id, created_by,
      created_via, source,
      visibility, ticket_type,
      created_at, updated_at
    )
    OVERRIDING SYSTEM VALUE
    VALUES (
      ${ft.id},
      ${ft.subject?.trim() || '(no subject)'},
      ${ft.description ?? ft.description_text ?? null},
      ${ft.description_text ?? null},
      ${FD_STATUS_MAP[ft.status] ?? 'open'},
      ${ft.type ? (FD_TYPE_MAP[ft.type] ?? null) : null},
      ${null},
      ${company?.id ?? null}::uuid,
      ${contactUserId}::uuid,
      ${createdBy}::uuid,
      ${'freshdesk'},
      ${'freshdesk'},
      ${'public'}, ${'support'},
      ${new Date(ft.created_at).toISOString()}::timestamptz,
      ${new Date(ft.updated_at).toISOString()}::timestamptz
    )
  `)

  const conversations = await fd.getAll<FdConversation>(`/api/v2/tickets/${ticketId}/conversations`)
  const comments = { imported: 0, skipped: 0, errors: 0 }
  const authorCache: Record<string, string> = {}

  for (const conv of conversations) {
    try {
      const bodyHtml = conv.body?.trim() || ''
      const text = conv.body_text?.trim() || bodyHtml.replace(/<[^>]+>/g, '').trim()
      if (!bodyHtml && !text) {
        comments.skipped++
        continue
      }
      const userId = await resolveCommentAuthor({
        conv,
        companyId: company?.id ?? null,
        contactUserId,
        fallbackUserId: adminUserId,
        agentNames,
        cache: authorCache,
      })
      const inserted = await db
        .insert(ticketComments)
        .values({
          ticketId,
          userId,
          comment: bodyHtml || text,
          visibility: conv.private ? 'note' : 'public',
          authorType: conv.incoming ? 'customer' : 'agent',
          createdAt: new Date(conv.created_at),
          receivedAt: new Date(conv.created_at),
          fdConversationId: conv.id,
        })
        .onConflictDoNothing({ target: [ticketComments.fdConversationId] })
        .returning({ id: ticketComments.id })
      if (inserted.length > 0) comments.imported++
      else comments.skipped++
    } catch {
      comments.errors++
    }
  }

  const attachments = await importFdTicketAttachments({
    ticketId,
    ticketFiles: ft.attachments ?? [],
    conversations,
    authHeader: fd.authHeader,
  })

  return {
    ticketId,
    status: 'imported',
    title: ft.subject?.trim() || '(no subject)',
    company: company?.name ?? null,
    message: 'Imported.',
    comments,
    attachments,
  }
}

/** Keeps the tickets ID sequence ahead of the Freshdesk IDs inserted with OVERRIDING SYSTEM VALUE. */
export async function resetTicketIdSequence(): Promise<void> {
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('tickets','id'), COALESCE((SELECT MAX(id) FROM tickets), 0))`)
}
