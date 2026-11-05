import { appSettings,db } from '@/lib/db'
import type { FdAttachment } from '@/lib/freshdesk-attachments'

/** Where a ticket is read from when it is imported: Freshdesk itself, or the FD Archive (a copy of Freshdesk kept in the fd-archive app). Both give the same Freshdesk-shaped data. */
export type TicketSourceKind = 'freshdesk' | 'archive'

export type FdTicket = {
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

export type FdConversation = {
  id: number
  body: string
  body_text: string | null
  incoming: boolean
  private: boolean
  from_email: string | null
  created_at: string
  attachments?: FdAttachment[]
}

export type FdCompany = { id: number; name: string; domains?: string[] }
export type FdContact = { id: number; name: string; email: string | null; phone?: string | null; mobile?: string | null }

export interface TicketSource {
  kind: TicketSourceKind
  /** Used to download attachment files (the archive wants its key, Freshdesk its Basic login). */
  attachmentAuthHeader: string
  /** Agent email (lowercase) → name, to name the placeholder users made for agents who wrote comments. */
  agentNames: Record<string, string>
  getTicket(id: number): Promise<{ status: number; data: FdTicket | null }>
  getConversations(id: number): Promise<FdConversation[]>
  getCompany(id: number): Promise<FdCompany | null>
  getContact(id: number): Promise<FdContact | null>
}

type FdLikeClient = {
  authHeader: string
  get: <T>(path: string) => Promise<{ status: number; data: T | null }>
  getAll: <T>(path: string) => Promise<T[]>
}

/** Reads straight from Freshdesk (the client from createFdClient). */
export function freshdeskSource(fd: FdLikeClient, agentNames: Record<string, string>): TicketSource {
  return {
    kind: 'freshdesk',
    attachmentAuthHeader: fd.authHeader,
    agentNames,
    getTicket: (id) => fd.get<FdTicket>(`/api/v2/tickets/${id}`),
    getConversations: (id) => fd.getAll<FdConversation>(`/api/v2/tickets/${id}/conversations`),
    getCompany: async (id) => (await fd.get<FdCompany>(`/api/v2/companies/${id}`)).data,
    getContact: async (id) => (await fd.get<FdContact>(`/api/v2/contacts/${id}`)).data,
  }
}

type ArchiveAttachment = { id: number; name: string; content_type?: string; size?: number; url: string }
type ArchiveAuthor = { id: number; type: 'agent' | 'contact'; name: string | null; email: string | null } | null
type ArchiveComment = {
  id: number
  incoming: boolean
  private: boolean
  from_email: string | null
  author: ArchiveAuthor
  body: string | null
  body_text: string | null
  attachments: ArchiveAttachment[]
  created_at: string
}
type ArchiveTicket = {
  id: number
  subject: string
  type: string | null
  status: number
  company: { id: number; name: string } | null
  requester: { id: number; name: string | null; email: string | null } | null
  description: string | null
  description_text: string | null
  attachments: ArchiveAttachment[]
  comments: ArchiveComment[]
  created_at: string
  updated_at: string
}

const asAttachment = (a: ArchiveAttachment): FdAttachment => ({ id: a.id, name: a.name, attachment_url: a.url, content_type: a.content_type, size: a.size })

/** The FD Archive address and key, kept in Settings (Freshdesk Import). Null when not filled in. */
export async function loadArchiveSettings(): Promise<{ baseUrl: string; apiKey: string } | null> {
  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']))
  const url = (map['fd_archive_url'] ?? '').trim()
  const apiKey = (map['fd_archive_api_key'] ?? '').trim()
  if (!url || !apiKey) return null
  return { baseUrl: (url.startsWith('http') ? url : `https://${url}`).replace(/\/+$/, ''), apiKey }
}

/**
 * Reads from the FD Archive API (GET /api/v1/tickets/{id}). A ticket comes with its company, requester and whole thread in one call,
 * so the company, contact and conversation lookups of the importer are answered from what that call returned.
 */
export async function archiveSource(baseUrl: string, apiKey: string): Promise<TicketSource> {
  const headers = { 'X-API-Key': apiKey, Accept: 'application/json' }
  const companies = new Map<number, FdCompany>()
  const contacts = new Map<number, FdContact>()
  const threads = new Map<number, FdConversation[]>()
  const agentNames: Record<string, string> = {}

  return {
    kind: 'archive',
    attachmentAuthHeader: `Bearer ${apiKey}`,
    agentNames,
    async getTicket(id) {
      let res: Response | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${baseUrl}/api/v1/tickets/${id}`, { headers, cache: 'no-store' })
        if (res.status !== 429) break
        await new Promise((r) => setTimeout(r, 30000))
      }
      if (!res || !res.ok) return { status: res?.status ?? 0, data: null }
      const t = ((await res.json()) as { data: ArchiveTicket }).data

      if (t.company) companies.set(t.company.id, { id: t.company.id, name: t.company.name, domains: [] })
      if (t.requester) contacts.set(t.requester.id, { id: t.requester.id, name: t.requester.name ?? '', email: t.requester.email })

      const thread: FdConversation[] = (t.comments ?? []).map((c) => {
        // An agent's private note often has no from_email; the archived author still tells who wrote it.
        const email = (c.from_email || c.author?.email || '').trim().toLowerCase() || null
        if (c.author?.type === 'agent' && c.author.email && c.author.name) agentNames[c.author.email.toLowerCase()] = c.author.name
        return {
          id: c.id,
          body: c.body ?? '',
          body_text: c.body_text,
          incoming: c.incoming,
          private: c.private,
          from_email: email,
          created_at: c.created_at,
          attachments: (c.attachments ?? []).map(asAttachment),
        }
      })
      threads.set(t.id, thread)

      return {
        status: 200,
        data: {
          id: t.id,
          subject: t.subject,
          description: t.description,
          description_text: t.description_text,
          status: t.status,
          type: t.type,
          requester_id: t.requester?.id ?? 0,
          company_id: t.company?.id ?? null,
          created_at: t.created_at,
          updated_at: t.updated_at,
          attachments: (t.attachments ?? []).map(asAttachment),
        },
      }
    },
    getConversations: async (id) => threads.get(id) ?? [],
    getCompany: async (id) => companies.get(id) ?? null,
    getContact: async (id) => contacts.get(id) ?? null,
  }
}
