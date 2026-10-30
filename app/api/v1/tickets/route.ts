import { and, asc, desc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { createTicketViaApi } from '@/lib/api-ticket-create'
import { csv, isYmd, pageInfo, siteUrl, sqlList, ticketVisibility, toWibIso, wibRange } from '@/lib/api-v1'
import { companies, db, ticketAssignees, tickets, ticketTypes, users } from '@/lib/db'
import { CLOSED_LIKE_STATUS_LIST } from '@/lib/ticket-status-workflow'
import { isUserInactive } from '@/lib/user-status'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

const SORTS = {
  id: tickets.id,
  created_at: tickets.createdAt,
  updated_at: tickets.updatedAt,
  due_date: tickets.dueDate,
  priority: tickets.priority,
} as const

const lowerList = (v: string | null) => csv(v).map((s) => s.toLowerCase())

/**
 * GET /api/v1/tickets - tickets with filters that can be combined (all of them must match).
 * Dates are YYYY-MM-DD (WIB days): created_from/created_to, updated_from/updated_to, due_from/due_to.
 * Company: company_id, company (name contains), customer_email. People: assignee_email, assignee_id, unassigned=1, creator_email.
 * skill (name), primary_skill=1, type (slug or title), type_id, status, done=0|1, overdue=1, priority_min/priority_max,
 * tag (name), search (title/description, or a ticket number), ids. Paging: limit (max 200), offset; sort and order.
 * Auth: browser session or an API key with the `tickets:read` scope.
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'tickets:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

  const conditions: SQL[] = [eq(tickets.ticketType, 'support')]

  // Same visibility as the ticket list.
  const visible = await ticketVisibility(me)
  if (visible) conditions.push(visible)

  // Dates
  for (const [fromKey, toKey, col] of [
    ['created_from', 'created_to', tickets.createdAt],
    ['updated_from', 'updated_to', tickets.updatedAt],
    ['due_from', 'due_to', tickets.dueDate],
  ] as const) {
    const from = q.get(fromKey)
    const to = q.get(toKey)
    if (from && !isYmd(from)) return bad(`${fromKey} must be YYYY-MM-DD`)
    if (to && !isYmd(to)) return bad(`${toKey} must be YYYY-MM-DD`)
    if (from) conditions.push(sql`${col} >= ${wibRange(from, from).start.toISOString()}`)
    if (to) conditions.push(sql`${col} <= ${wibRange(to, to).end.toISOString()}`)
  }

  // Company / customer
  const companyIds = csv(q.get('company_id'))
  if (companyIds.length) conditions.push(sql`${tickets.companyId} IN (${sqlList(companyIds)})`)
  const companyNames = csv(q.get('company'))
  if (companyNames.length) {
    const likes = companyNames.map((n) => sql`name ILIKE ${'%' + n.replace(/[%_\\]/g, '\\$&') + '%'}`)
    conditions.push(sql`${tickets.companyId} IN (SELECT id FROM companies WHERE ${sql.join(likes, sql` OR `)})`)
  }
  const customerEmails = lowerList(q.get('customer_email'))
  if (customerEmails.length) {
    const ids = sql`(SELECT id FROM users WHERE lower(email) IN (${sqlList(customerEmails)}))`
    conditions.push(sql`(${tickets.contactUserId} IN ${ids} OR ${tickets.createdBy} IN ${ids})`)
  }

  // People
  const assigneeEmails = lowerList(q.get('assignee_email'))
  if (assigneeEmails.length) {
    conditions.push(sql`EXISTS (SELECT 1 FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.ticket_id = ${tickets.id} AND lower(u.email) IN (${sqlList(assigneeEmails)}))`)
  }
  const assigneeIds = csv(q.get('assignee_id'))
  if (assigneeIds.length) {
    conditions.push(sql`EXISTS (SELECT 1 FROM ticket_assignees ta WHERE ta.ticket_id = ${tickets.id} AND ta.user_id IN (${sqlList(assigneeIds)}))`)
  }
  if (q.get('unassigned') === '1') conditions.push(sql`NOT EXISTS (SELECT 1 FROM ticket_assignees ta WHERE ta.ticket_id = ${tickets.id})`)
  const creatorEmails = lowerList(q.get('creator_email'))
  if (creatorEmails.length) conditions.push(sql`${tickets.createdBy} IN (SELECT id FROM users WHERE lower(email) IN (${sqlList(creatorEmails)}))`)

  // Skill and type
  const skills = lowerList(q.get('skill'))
  if (skills.length) {
    const primary = q.get('primary_skill') === '1' ? sql` AND ts.is_primary` : sql``
    conditions.push(sql`EXISTS (SELECT 1 FROM ticket_skills ts JOIN skills s ON s.id = ts.skill_id WHERE ts.ticket_id = ${tickets.id} AND lower(s.name) IN (${sqlList(skills)})${primary})`)
  }
  const typeIds = csv(q.get('type_id')).map(Number).filter((n) => Number.isInteger(n))
  if (typeIds.length) conditions.push(sql`${tickets.typeId} IN (${sqlList(typeIds)})`)
  const types = lowerList(q.get('type'))
  if (types.length) {
    conditions.push(sql`${tickets.typeId} IN (SELECT id FROM ticket_types WHERE lower(slug) IN (${sqlList(types)}) OR lower(title) IN (${sqlList(types)}))`)
  }

  // Status, priority, tags, search
  const statuses = csv(q.get('status'))
  if (statuses.length) conditions.push(sql`${tickets.status} IN (${sqlList(statuses)})`)
  const done = q.get('done')
  if (done === '1') conditions.push(sql`${tickets.status} IN (${sqlList(CLOSED_LIKE_STATUS_LIST)})`)
  if (done === '0') conditions.push(sql`${tickets.status} NOT IN (${sqlList(CLOSED_LIKE_STATUS_LIST)})`)
  if (q.get('overdue') === '1') {
    conditions.push(sql`${tickets.dueDate} IS NOT NULL AND ${tickets.dueDate} < now() AND ${tickets.status} NOT IN (${sqlList(CLOSED_LIKE_STATUS_LIST)})`)
  }
  const pMin = q.get('priority_min')
  const pMax = q.get('priority_max')
  if (pMin && !Number.isFinite(Number(pMin))) return bad('priority_min must be a number')
  if (pMax && !Number.isFinite(Number(pMax))) return bad('priority_max must be a number')
  if (pMin) conditions.push(sql`${tickets.priority} >= ${Number(pMin)}`)
  if (pMax) conditions.push(sql`${tickets.priority} <= ${Number(pMax)}`)
  const tagNames = lowerList(q.get('tag'))
  if (tagNames.length) {
    conditions.push(sql`EXISTS (SELECT 1 FROM ticket_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.ticket_id = ${tickets.id} AND lower(g.name) IN (${sqlList(tagNames)}))`)
  }
  const search = (q.get('search') ?? '').trim().replace(/^#/, '')
  if (search) {
    const pattern = `%${search.replace(/[%_\\]/g, '\\$&')}%`
    conditions.push(
      /^\d+$/.test(search)
        ? sql`(${tickets.id} = ${Number(search)} OR ${tickets.title} ILIKE ${pattern} OR ${tickets.description} ILIKE ${pattern})`
        : sql`(${tickets.title} ILIKE ${pattern} OR ${tickets.description} ILIKE ${pattern})`
    )
  }
  const ids = csv(q.get('ids')).map(Number).filter((n) => Number.isInteger(n)).slice(0, 200)
  if (ids.length) conditions.push(inArray(tickets.id, ids))

  // Paging and order
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.get('limit')) || DEFAULT_LIMIT))
  const offset = Math.max(0, Number(q.get('offset')) || 0)
  const sortKey = (q.get('sort') ?? 'id') as keyof typeof SORTS
  if (!(sortKey in SORTS)) return bad(`sort must be one of ${Object.keys(SORTS).join(', ')}`)
  const dir = q.get('order') === 'asc' ? asc : desc
  const includeDescription = csv(q.get('include')).includes('description')

  const where = and(...conditions)
  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: tickets.id,
        title: tickets.title,
        description: tickets.description,
        status: tickets.status,
        priority: tickets.priority,
        dueDate: tickets.dueDate,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        typeId: tickets.typeId,
        typeTitle: ticketTypes.title,
        typeSlug: ticketTypes.slug,
        companyId: tickets.companyId,
        companyName: companies.name,
        contactUserId: tickets.contactUserId,
        createdBy: tickets.createdBy,
      })
      .from(tickets)
      .leftJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(where)
      .orderBy(dir(SORTS[sortKey]), desc(tickets.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(tickets).where(where),
  ])

  const ticketIds = rows.map((r) => r.id)
  const [assigneeRows, tagRows, skillRows] = ticketIds.length
    ? await Promise.all([
        db
          .select({ ticketId: ticketAssignees.ticketId, id: users.id, fullName: users.fullName, email: users.email, status: users.status })
          .from(ticketAssignees)
          .innerJoin(users, eq(ticketAssignees.userId, users.id))
          .where(inArray(ticketAssignees.ticketId, ticketIds)),
        db.execute(sql`SELECT tt.ticket_id AS ticket_id, g.name AS name FROM ticket_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.ticket_id IN (${sqlList(ticketIds)})`),
        db.execute(sql`SELECT ts.ticket_id AS ticket_id, s.name AS name, ts.is_primary AS is_primary FROM ticket_skills ts JOIN skills s ON s.id = ts.skill_id WHERE ts.ticket_id IN (${sqlList(ticketIds)})`),
      ])
    : [[], [], []]
  const peopleIds = [...new Set(rows.flatMap((r) => [r.contactUserId, r.createdBy]).filter((v): v is string => !!v))]
  const peopleRows = peopleIds.length ? await db.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(inArray(users.id, peopleIds)) : []
  const person = new Map(peopleRows.map((p) => [p.id, { full_name: p.fullName, email: p.email }]))

  const asRows = <T,>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []))
  const tagsBy = new Map<number, string[]>()
  for (const t of asRows<{ ticket_id: number; name: string }>(tagRows)) tagsBy.set(t.ticket_id, [...(tagsBy.get(t.ticket_id) ?? []), t.name])
  const skillsBy = new Map<number, { name: string; is_primary: boolean }[]>()
  for (const s of asRows<{ ticket_id: number; name: string; is_primary: boolean }>(skillRows)) {
    skillsBy.set(s.ticket_id, [...(skillsBy.get(s.ticket_id) ?? []), { name: s.name, is_primary: s.is_primary }])
  }
  const assigneesBy = new Map<number, { id: string; full_name: string | null; email: string; active: boolean }[]>()
  for (const a of assigneeRows as { ticketId: number; id: string; fullName: string | null; email: string; status: string | null }[]) {
    assigneesBy.set(a.ticketId, [...(assigneesBy.get(a.ticketId) ?? []), { id: a.id, full_name: a.fullName, email: a.email, active: !isUserInactive(a.status) }])
  }

  return NextResponse.json({
    total: totalRow[0]?.n ?? 0,
    limit,
    offset,
    ...pageInfo(offset, rows.length, totalRow[0]?.n ?? 0),
    tickets: rows.map((r) => ({
      id: r.id,
      title: r.title,
      ...(includeDescription ? { description: r.description } : {}),
      status: r.status,
      priority: r.priority,
      type: r.typeId ? { id: r.typeId, title: r.typeTitle, slug: r.typeSlug } : null,
      company: r.companyId ? { id: r.companyId, name: r.companyName } : null,
      customer: r.contactUserId && person.get(r.contactUserId) ? person.get(r.contactUserId) : null,
      created_by: r.createdBy && person.get(r.createdBy) ? person.get(r.createdBy) : null,
      assignees: assigneesBy.get(r.id) ?? [],
      tags: tagsBy.get(r.id) ?? [],
      skills: skillsBy.get(r.id) ?? [],
      created_at: toWibIso(r.createdAt),
      updated_at: toWibIso(r.updatedAt),
      due_date: toWibIso(r.dueDate),
      url: `${siteUrl()}/tickets/${r.id}`,
    })),
  })
}

/** POST /api/v1/tickets - create a ticket as the key's owner. See lib/api-ticket-create.ts. Scope: `tickets:create`. */
export async function POST(request: Request) {
  return createTicketViaApi(request)
}
