import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { siteUrl, ticketVisibility, toWibIso } from '@/lib/api-v1'
import { db, skills, tags, ticketAssignees, tickets, ticketSkills, ticketStatuses, ticketTags, users } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { getTicketSkillSet, setTicketSkills } from '@/lib/skills'
import { logTicketActivity } from '@/lib/ticket-activity-log'
import { patchTicket } from '@/lib/ticket-patch'
import { isUserInactive } from '@/lib/user-status'

const MAX_LIST = 20

type Body = Record<string, unknown>

const strList = (v: unknown): string[] | null => {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return null
  return [...new Set((v as string[]).map((x) => x.trim()).filter(Boolean))]
}

const bad = (error: string) => NextResponse.json({ error }, { status: 400 })

async function snapshot(ticketId: number) {
  const [t] = await db.select({ status: tickets.status, dueDate: tickets.dueDate }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  const [assignees, tagRows, skillRows] = await Promise.all([
    db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(ticketAssignees)
      .innerJoin(users, eq(ticketAssignees.userId, users.id))
      .where(eq(ticketAssignees.ticketId, ticketId)),
    db.select({ id: tags.id, name: tags.name }).from(ticketTags).innerJoin(tags, eq(ticketTags.tagId, tags.id)).where(eq(ticketTags.ticketId, ticketId)),
    db
      .select({ id: skills.id, name: skills.name, primary: ticketSkills.isPrimary })
      .from(ticketSkills)
      .innerJoin(skills, eq(ticketSkills.skillId, skills.id))
      .where(eq(ticketSkills.ticketId, ticketId)),
  ])
  return {
    status: t?.status ?? null,
    due_date: toWibIso(t?.dueDate ?? null),
    assignees: assignees.map((a) => ({ full_name: a.fullName ?? a.email, email: a.email })),
    tags: tagRows.map((x) => x.name).sort(),
    skills: skillRows.map((x) => x.name).sort(),
    primary_skill: skillRows.find((x) => x.primary)?.name ?? null,
    _assigneeIds: assignees.map((a) => a.id),
    _tagIds: tagRows.map((x) => x.id),
    _skillIds: skillRows.map((x) => x.id),
    _primarySkillId: skillRows.find((x) => x.primary)?.id ?? null,
  }
}

/**
 * PATCH /api/v1/tickets/{id} - change a ticket's status, assignees, skills, tags or due date.
 * Runs the same code as the app (activity log, notifications to new assignees, emails, Slack, automations), as the key's owner.
 * Lists are add/remove, never "replace everything", so an AI cannot wipe what it did not mention.
 * `via` (required) names the assistant; the activity entries of this change are marked as made through the API.
 */
export async function updateTicketViaApi(request: Request, rawId: string) {
  const me = await getApiUser(request, 'tickets:update')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const ticketId = Number(rawId.replace(/^#/, ''))
  if (!Number.isInteger(ticketId) || ticketId <= 0) return bad('Invalid ticket number')

  const body = (await request.json().catch(() => null)) as Body | null
  if (!body || typeof body !== 'object') return bad('Send a JSON body')

   
  const via = typeof body.via === 'string' ? body.via.replace(/[\u0000-\u001f<>]/g, '').trim() : ''
  if (via.length < 2 || via.length > 60) return bad('via is required: the name of the AI assistant making this change, for example "Claude" or "ChatGPT" (2 to 60 characters)')

  const known = ['via', 'status', 'due_date', 'add_assignee_emails', 'remove_assignee_emails', 'add_tags', 'remove_tags', 'add_skills', 'remove_skills', 'primary_skill']
  const unknown = Object.keys(body).filter((k) => !known.includes(k))
  if (unknown.length) return bad(`Unknown field(s): ${unknown.join(', ')}. Allowed: ${known.filter((k) => k !== 'via').join(', ')}`)

  const addEmails = strList(body.add_assignee_emails)
  const removeEmails = strList(body.remove_assignee_emails)
  const addTags = strList(body.add_tags)
  const removeTags = strList(body.remove_tags)
  const addSkills = strList(body.add_skills)
  const removeSkills = strList(body.remove_skills)
  if ([addEmails, removeEmails, addTags, removeTags, addSkills, removeSkills].some((l) => l === null)) return bad('add_/remove_ fields must be lists of text')
  if ([addEmails, removeEmails, addTags, removeTags, addSkills, removeSkills].some((l) => (l?.length ?? 0) > MAX_LIST)) return bad(`At most ${MAX_LIST} items per list`)
  if (body.primary_skill !== undefined && body.primary_skill !== null && typeof body.primary_skill !== 'string') return bad('primary_skill must be a skill name or null')

  const hasChange = ['status', 'due_date', 'add_assignee_emails', 'remove_assignee_emails', 'add_tags', 'remove_tags', 'add_skills', 'remove_skills', 'primary_skill'].some((k) => body[k] !== undefined)
  if (!hasChange) return bad('Nothing to change: send at least one of status, due_date, add_assignee_emails, remove_assignee_emails, add_tags, remove_tags, add_skills, remove_skills, primary_skill')

  const visible = await ticketVisibility(me)
  const [t] = await db
    .select({ id: tickets.id, title: tickets.title, companyId: tickets.companyId })
    .from(tickets)
    .where(visible ? and(eq(tickets.id, ticketId), eq(tickets.ticketType, 'support'), visible) : and(eq(tickets.id, ticketId), eq(tickets.ticketType, 'support')))
    .limit(1)
  if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  // Check everything first, so a wrong name changes nothing.
  let status: string | undefined
  if (body.status !== undefined) {
    const slug = typeof body.status === 'string' ? body.status.trim().toLowerCase() : ''
    const [st] = slug ? await db.select({ slug: ticketStatuses.slug }).from(ticketStatuses).where(and(eq(ticketStatuses.slug, slug), eq(ticketStatuses.isActive, true))).limit(1) : []
    if (!st) {
      const all = await db.select({ slug: ticketStatuses.slug }).from(ticketStatuses).where(eq(ticketStatuses.isActive, true))
      return bad(`Unknown status. Use one of: ${all.map((s) => s.slug).join(', ')}`)
    }
    status = st.slug
  }

  let dueDate: string | null | undefined
  if (body.due_date !== undefined) {
    if (body.due_date === null) dueDate = null
    else if (typeof body.due_date === 'string') {
      const raw = body.due_date.trim()
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:00+07:00` : raw
      const d = new Date(iso)
      if (Number.isNaN(d.getTime()) || (!/^\d{4}-\d{2}-\d{2}$/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/.test(raw))) {
        return bad('due_date must be null, a date YYYY-MM-DD (end of that day, WIB) or a date and time with an offset, e.g. 2026-11-10T17:00:00+07:00')
      }
      dueDate = d.toISOString()
    } else return bad('due_date must be null or text')
  }

  const emails = [...new Set([...(addEmails ?? []), ...(removeEmails ?? [])].map((e) => e.toLowerCase()))]
  const people = emails.length
    ? await db.select({ id: users.id, email: users.email, role: users.role, status: users.status }).from(users).where(inArray(sql`lower(${users.email})`, emails))
    : []
  const personBy = new Map(people.map((p) => [p.email.toLowerCase(), p]))
  const missing = emails.filter((e) => !personBy.has(e))
  if (missing.length) return bad(`No team member with email: ${missing.join(', ')}`)
  for (const e of (addEmails ?? []).map((x) => x.toLowerCase())) {
    const p = personBy.get(e)!
    if (!isTeamRole((p.role ?? '').toLowerCase())) return bad(`${e} is not a team member and cannot be assigned`)
    if (isUserInactive(p.status)) return bad(`${e} is not active and cannot be assigned`)
  }

  const tagNames = [...new Set([...(addTags ?? []), ...(removeTags ?? [])].map((x) => x.toLowerCase()))]
  const tagRows = tagNames.length
    ? await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(and(inArray(sql`lower(${tags.name})`, tagNames), t.companyId ? or(isNull(tags.companyId), eq(tags.companyId, t.companyId)) : isNull(tags.companyId)))
    : []
  const tagBy = new Map(tagRows.map((r) => [r.name.toLowerCase(), r.id]))
  const missingTags = tagNames.filter((n) => !tagBy.has(n))
  if (missingTags.length) return bad(`Unknown tag(s) for this ticket: ${missingTags.join(', ')}. Tags are not created through the API.`)

  const primaryName = typeof body.primary_skill === 'string' ? body.primary_skill.trim() : null
  const skillNames = [...new Set([...(addSkills ?? []), ...(removeSkills ?? []), ...(primaryName ? [primaryName] : [])].map((x) => x.toLowerCase()))]
  const skillRows = skillNames.length ? await db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(sql`lower(${skills.name})`, skillNames)) : []
  const skillBy = new Map(skillRows.map((r) => [r.name.toLowerCase(), r.id]))
  const missingSkills = skillNames.filter((n) => !skillBy.has(n))
  if (missingSkills.length) return bad(`Unknown skill(s): ${missingSkills.join(', ')}`)

  const before = await snapshot(ticketId)
  const nextAssignees = new Set(before._assigneeIds)
  for (const e of removeEmails ?? []) nextAssignees.delete(personBy.get(e.toLowerCase())!.id)
  for (const e of addEmails ?? []) nextAssignees.add(personBy.get(e.toLowerCase())!.id)
  const nextTags = new Set(before._tagIds)
  for (const n of removeTags ?? []) nextTags.delete(tagBy.get(n.toLowerCase())!)
  for (const n of addTags ?? []) nextTags.add(tagBy.get(n.toLowerCase())!)
  const nextSkills = new Set(before._skillIds)
  for (const n of removeSkills ?? []) nextSkills.delete(skillBy.get(n.toLowerCase())!)
  for (const n of addSkills ?? []) nextSkills.add(skillBy.get(n.toLowerCase())!)
  const sameSet = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x))

  const [actor] = await db.select({ name: users.fullName, email: users.email }).from(users).where(eq(users.id, me.id)).limit(1)
  const session = { user: { id: me.id, role: me.role, name: actor?.name ?? null, email: actor?.email ?? null } }
  const ctx = { params: Promise.resolve({ id: String(ticketId) }) }
  const patch = async (payload: Record<string, unknown>) =>
    patchTicket(new Request(request.url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }), ctx, session)

  const clock = await db.execute(sql`select clock_timestamp() as now`)
  const startedAt = ((Array.isArray(clock) ? clock : (clock as { rows?: unknown[] }).rows ?? [])[0] as { now: Date | string }).now

  // The status first: it has its own rules (priority queue, close email) in the app's status change.
  if (status !== undefined && status !== before.status) {
    const res = await patch({ status })
    if (!res.ok) return NextResponse.json({ error: 'The status change was refused' }, { status: res.status })
  }
  const rest: Record<string, unknown> = {}
  if (dueDate !== undefined) rest.due_date = dueDate
  if (!sameSet(nextAssignees, before._assigneeIds)) rest.assignees = [...nextAssignees]
  if (!sameSet(nextTags, before._tagIds)) rest.tag_ids = [...nextTags]
  if (Object.keys(rest).length) {
    const res = await patch(rest)
    if (!res.ok) return NextResponse.json({ error: 'The change was refused' }, { status: res.status })
  }

  const skillsChanged = !sameSet(nextSkills, before._skillIds) || (body.primary_skill !== undefined && (primaryName ? skillBy.get(primaryName.toLowerCase()) : null) !== before._primarySkillId)
  if (skillsChanged) {
    const wantedPrimary = body.primary_skill !== undefined ? (primaryName ? skillBy.get(primaryName.toLowerCase()) : null) : before._primarySkillId
    await setTicketSkills(ticketId, [...nextSkills], wantedPrimary && nextSkills.has(wantedPrimary) ? wantedPrimary : null)
    const after = await getTicketSkillSet(ticketId)
    const names = await db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(skills.id, [...new Set([...before._skillIds, ...after.skill_ids])]))
    const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? id
    await logTicketActivity({
      ticketId,
      actorUserId: me.id,
      actorRole: 'agent',
      action: 'ticket_updated',
      metadata: {
        changed_keys: ['skills'],
        changes: { skills: { from: before.skills, to: after.skill_ids.map(nameOf).sort() } },
        source: 'api',
        via,
      },
    })
    bumpTicketDataVersion(ticketId)
  }

  // Mark what this call wrote in the ticket's activity as made through the API.
  await db
    .execute(
      sql`UPDATE ticket_activity_log
          SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ source: 'api', via })}::jsonb
          WHERE ticket_id = ${ticketId} AND actor_user_id = ${me.id} AND created_at >= ${startedAt}`
    )
    .catch((e) => console.error('[api ticket update] could not mark the activity:', e))

  const after = await snapshot(ticketId)
  const strip = ({ _assigneeIds, _tagIds, _skillIds, _primarySkillId, ...pub }: typeof after) => {
    void _assigneeIds, void _tagIds, void _skillIds, void _primarySkillId
    return pub
  }
  return NextResponse.json({ ticket_id: ticketId, title: t.title, via, before: strip(before), after: strip(after), url: `${siteUrl()}/tickets/${ticketId}` })
}
