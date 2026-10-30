import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { siteUrl } from '@/lib/api-v1'
import { isAdmin } from '@/lib/auth-utils'
import { companies, db, skills, tags, teamMembers, teams, ticketStatuses, ticketTypes, users } from '@/lib/db'
import { createTicket } from '@/lib/ticket-create'
import { isUserInactive } from '@/lib/user-status'

const MAX_TITLE = 250
const MAX_TEXT = 20000
const MAX_LIST = 20

type Body = Record<string, unknown>

const bad = (error: string) => NextResponse.json({ error }, { status: 400 })
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')

const strList = (v: unknown): string[] | null => {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return null
  return [...new Set((v as string[]).map((x) => x.trim()).filter(Boolean))]
}

/**
 * POST /api/v1/tickets - create a support ticket as the key's owner. Runs the same code as the app: the company's priority queue,
 * default skills, automations, notifications to assignees, Slack and the confirmation email to the requester.
 * The description always ends with "Created via <AI> (API)" and the activity entry is marked as made through the API.
 */
export async function createTicketViaApi(request: Request) {
  const me = await getApiUser(request, 'tickets:create')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as Body | null
  if (!body || typeof body !== 'object') return bad('Send a JSON body')

   
  const via = typeof body.via === 'string' ? body.via.replace(/[\u0000-\u001f<>]/g, '').trim() : ''
  if (via.length < 2 || via.length > 60) return bad('via is required: the name of the AI assistant creating this ticket, for example "Claude" or "ChatGPT" (2 to 60 characters)')

  const known = ['via', 'title', 'description', 'company_id', 'contact_email', 'type', 'type_id', 'priority', 'due_date', 'status', 'team_id', 'assignee_emails', 'tags', 'skills', 'primary_skill']
  const unknown = Object.keys(body).filter((k) => !known.includes(k))
  if (unknown.length) return bad(`Unknown field(s): ${unknown.join(', ')}. Allowed: ${known.filter((k) => k !== 'via').join(', ')}`)

  const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : ''
  if (!title) return bad('title is required')
  if (title.length > MAX_TITLE) return bad(`title is too long (max ${MAX_TITLE} characters)`)
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (description.length > MAX_TEXT) return bad(`description is too long (max ${MAX_TEXT} characters)`)

  const emails = strList(body.assignee_emails)
  const tagNames = strList(body.tags)
  const skillNames = strList(body.skills)
  if (emails === null || tagNames === null || skillNames === null) return bad('assignee_emails, tags and skills must be lists of text')
  if ([emails, tagNames, skillNames].some((l) => l.length > MAX_LIST)) return bad(`At most ${MAX_LIST} items per list`)
  const primaryName = typeof body.primary_skill === 'string' ? body.primary_skill.trim() : ''

  // Company
  let companyId: string | null = null
  if (body.company_id !== undefined && body.company_id !== null && body.company_id !== '') {
    if (typeof body.company_id !== 'string') return bad('company_id must be a company id from /api/v1/companies')
    const [c] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, body.company_id)).limit(1)
    if (!c) return bad('Unknown company_id. Find it with /api/v1/companies?q=name')
    companyId = c.id
  }

  // Customer (contact) by email
  let contactUserId: string | null = null
  if (body.contact_email !== undefined && body.contact_email !== null && body.contact_email !== '') {
    if (typeof body.contact_email !== 'string') return bad('contact_email must be text')
    const [u] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${body.contact_email.trim().toLowerCase()}`).limit(1)
    if (!u) return bad(`No user with email ${body.contact_email}`)
    contactUserId = u.id
  }

  // Type, by slug or id
  let typeId: number | null = null
  if (body.type !== undefined || body.type_id !== undefined) {
    const [t] =
      body.type_id !== undefined
        ? await db.select({ id: ticketTypes.id }).from(ticketTypes).where(eq(ticketTypes.id, Number(body.type_id))).limit(1)
        : await db.select({ id: ticketTypes.id }).from(ticketTypes).where(sql`lower(${ticketTypes.slug}) = ${String(body.type).trim().toLowerCase()}`).limit(1)
    if (!t) return bad('Unknown ticket type. See /api/v1/catalog (types)')
    typeId = t.id
  }

  // Status (default: open)
  let status = 'open'
  if (body.status !== undefined) {
    const slug = typeof body.status === 'string' ? body.status.trim().toLowerCase() : ''
    const [st] = slug ? await db.select({ slug: ticketStatuses.slug }).from(ticketStatuses).where(and(eq(ticketStatuses.slug, slug), eq(ticketStatuses.isActive, true))).limit(1) : []
    if (!st) return bad('Unknown status. See /api/v1/catalog (statuses)')
    status = st.slug
  }

  // Team (admins any, others public or their own)
  let teamId: string | null = null
  if (body.team_id !== undefined && body.team_id !== null && body.team_id !== '') {
    if (typeof body.team_id !== 'string') return bad('team_id must be a team id from /api/v1/catalog')
    const [tm] = await db.select({ id: teams.id, type: teams.type }).from(teams).where(eq(teams.id, body.team_id)).limit(1)
    if (!tm) return bad('Unknown team_id. See /api/v1/catalog (teams)')
    if (!isAdmin(me.role) && tm.type !== 'public') {
      const [m] = await db.select({ id: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, tm.id), eq(teamMembers.userId, me.id))).limit(1)
      if (!m) return bad('You cannot use that team')
    }
    teamId = tm.id
  }

  // Due date
  let dueDate: string | null = null
  if (body.due_date !== undefined && body.due_date !== null && body.due_date !== '') {
    if (typeof body.due_date !== 'string') return bad('due_date must be text')
    const raw = body.due_date.trim()
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    const d = new Date(dateOnly ? `${raw}T23:59:00+07:00` : raw)
    if (Number.isNaN(d.getTime()) || (!dateOnly && !/(Z|[+-]\d{2}:?\d{2})$/.test(raw))) {
      return bad('due_date must be a date YYYY-MM-DD (end of that day, WIB) or a date and time with an offset, e.g. 2026-11-10T17:00:00+07:00')
    }
    dueDate = d.toISOString()
  }

  let priority: number | undefined
  if (body.priority !== undefined && body.priority !== null) {
    const n = Number(body.priority)
    if (!Number.isInteger(n) || n < 0) return bad('priority must be a whole number (its place in the queue, 1 first; 0 or leave out for the end)')
    priority = n
  }

  // Assignees by email (active team members only)
  const assigneeIds: string[] = []
  if (emails.length) {
    const people = await db
      .select({ id: users.id, email: users.email, role: users.role, status: users.status })
      .from(users)
      .where(inArray(sql`lower(${users.email})`, emails.map((e) => e.toLowerCase())))
    const by = new Map(people.map((p) => [p.email.toLowerCase(), p]))
    const missing = emails.filter((e) => !by.has(e.toLowerCase()))
    if (missing.length) return bad(`No team member with email: ${missing.join(', ')}`)
    for (const e of emails) {
      const p = by.get(e.toLowerCase())!
      if (!isTeamRole((p.role ?? '').toLowerCase())) return bad(`${e} is not a team member and cannot be assigned`)
      if (isUserInactive(p.status)) return bad(`${e} is not active and cannot be assigned`)
      assigneeIds.push(p.id)
    }
  }

  // Tags and skills by name; they must already exist
  const tagIds: string[] = []
  if (tagNames.length) {
    const rows = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(and(inArray(sql`lower(${tags.name})`, tagNames.map((n) => n.toLowerCase())), companyId ? or(isNull(tags.companyId), eq(tags.companyId, companyId)) : isNull(tags.companyId)))
    const by = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]))
    const missing = tagNames.filter((n) => !by.has(n.toLowerCase()))
    if (missing.length) return bad(`Unknown tag(s) for this ticket: ${missing.join(', ')}. Tags are not created through the API.`)
    tagIds.push(...tagNames.map((n) => by.get(n.toLowerCase())!))
  }
  let skillIds: string[] | undefined
  let primarySkillId: string | null = null
  if (skillNames.length || primaryName) {
    const wanted = [...new Set([...skillNames, ...(primaryName ? [primaryName] : [])])]
    const rows = await db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(sql`lower(${skills.name})`, wanted.map((n) => n.toLowerCase())))
    const by = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]))
    const missing = wanted.filter((n) => !by.has(n.toLowerCase()))
    if (missing.length) return bad(`Unknown skill(s): ${missing.join(', ')}`)
    skillIds = [...new Set(wanted.map((n) => by.get(n.toLowerCase())!))]
    primarySkillId = primaryName ? by.get(primaryName.toLowerCase())! : null
  }

  const [actor] = await db.select({ name: users.fullName, email: users.email }).from(users).where(eq(users.id, me.id)).limit(1)
  const session = { user: { id: me.id, role: me.role, name: actor?.name ?? null, email: actor?.email ?? null } }
  const html = `${description ? textToHtml(description) : ''}<p><em>Created via ${escapeHtml(via)} (API)</em></p>`
  const clock = await db.execute(sql`select clock_timestamp() as now`)
  const startedAt = ((Array.isArray(clock) ? clock : ((clock as { rows?: unknown[] }).rows ?? []))[0] as { now: Date | string }).now

  const res = await createTicket(
    new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        description: html,
        status,
        team_id: teamId,
        type_id: typeId,
        priority,
        company_id: companyId,
        due_date: dueDate,
        assignees: assigneeIds,
        tag_ids: tagIds,
        ...(skillIds ? { skill_ids: skillIds, primary_skill_id: primarySkillId } : {}),
        contact_user_id: contactUserId,
        created_via: 'api',
      }),
    }),
    session
  )
  const out = (await res.json().catch(() => ({}))) as { id?: number; error?: string; ticket_cross_company_warning?: string }
  if (!res.ok || !out.id) return NextResponse.json({ error: out.error ?? 'Failed to create the ticket' }, { status: res.ok ? 500 : res.status })

  await db
    .execute(
      sql`UPDATE ticket_activity_log
          SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ source: 'api', via })}::jsonb
          WHERE ticket_id = ${out.id} AND actor_user_id = ${me.id} AND created_at >= ${startedAt}`
    )
    .catch((e) => console.error('[api ticket create] could not mark the activity:', e))

  return NextResponse.json(
    {
      id: out.id,
      title,
      via,
      status,
      company_id: companyId,
      ...(out.ticket_cross_company_warning ? { warning: out.ticket_cross_company_warning } : {}),
      url: `${siteUrl()}/tickets/${out.id}`,
    },
    { status: 201 }
  )
}
