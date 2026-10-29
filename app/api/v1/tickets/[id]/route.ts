import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { csv, hours, htmlToText, siteUrl, ticketVisibility, toWibIso } from '@/lib/api-v1'
import {
  commentAttachments,
  companies,
  db,
  teams,
  ticketAssignees,
  ticketComments,
  tickets,
  ticketTimeTracker,
  ticketTypes,
  users,
} from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

export const dynamic = 'force-dynamic'

const DEFAULT_COMMENTS = 100
const MAX_COMMENTS = 500

/**
 * GET /api/v1/tickets/{id} - one ticket in full. Add comments=true for the conversation.
 * comments=true, comments_limit (default 100, max 500), comments_order = asc|desc (default asc),
 * comment_visibility = reply|note (customer-facing replies or internal notes), html=1 (also return the raw HTML of the text).
 * Auth: browser session or an API key with the `ticket-detail:read` scope.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getApiUser(request, 'ticket-detail:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = Number((await ctx.params).id.replace(/^#/, ''))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid ticket number' }, { status: 400 })
  const q = new URL(request.url).searchParams

  const visible = await ticketVisibility(me)
  const [t] = await db
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
      teamName: teams.name,
      contactUserId: tickets.contactUserId,
      createdBy: tickets.createdBy,
    })
    .from(tickets)
    .leftJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
    .leftJoin(companies, eq(tickets.companyId, companies.id))
    .leftJoin(teams, eq(tickets.teamId, teams.id))
    .where(visible ? and(eq(tickets.id, id), eq(tickets.ticketType, 'support'), visible) : and(eq(tickets.id, id), eq(tickets.ticketType, 'support')))
    .limit(1)
  if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const [assignees, tagRows, skillRows, sessions, people] = await Promise.all([
    db
      .select({ id: users.id, name: users.fullName, email: users.email })
      .from(ticketAssignees)
      .innerJoin(users, eq(ticketAssignees.userId, users.id))
      .where(eq(ticketAssignees.ticketId, id)),
    db.execute(sql`SELECT g.name AS name FROM ticket_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.ticket_id = ${id}`),
    db.execute(sql`SELECT s.name AS name, ts.is_primary AS is_primary FROM ticket_skills ts JOIN skills s ON s.id = ts.skill_id WHERE ts.ticket_id = ${id}`),
    db
      .select({
        userId: ticketTimeTracker.userId,
        stopTime: ticketTimeTracker.stopTime,
        startTime: ticketTimeTracker.startTime,
        durationSeconds: ticketTimeTracker.durationSeconds,
        durationAdjustment: ticketTimeTracker.durationAdjustment,
      })
      .from(ticketTimeTracker)
      .where(eq(ticketTimeTracker.ticketId, id)),
    db
      .select({ id: users.id, name: users.fullName, email: users.email })
      .from(users)
      .where(inArray(users.id, [t.contactUserId, t.createdBy].filter((v): v is string => !!v))),
  ])
  const asRows = <T,>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : ((r as { rows?: T[] }).rows ?? []))
  const person = new Map(people.map((p) => [p.id, { name: p.name, email: p.email }]))

  // Time tracked on this ticket, in total and per person (a running timer counts up to now).
  const now = Date.now()
  const bySeconds = new Map<string, number>()
  let totalSeconds = 0
  for (const s of sessions) {
    const sec = s.stopTime
      ? reportedDurationSeconds({ durationSeconds: s.durationSeconds, durationAdjustment: s.durationAdjustment })
      : Math.max(0, Math.floor((now - new Date(s.startTime).getTime()) / 1000))
    totalSeconds += sec
    bySeconds.set(s.userId, (bySeconds.get(s.userId) ?? 0) + sec)
  }
  const trackerPeople = bySeconds.size
    ? await db.select({ id: users.id, name: users.fullName, email: users.email }).from(users).where(inArray(users.id, [...bySeconds.keys()]))
    : []

  const includeHtml = q.get('html') === '1'
  let comments: Array<Record<string, unknown>> | undefined
  let commentsTotal: number | undefined
  if (q.get('comments') === 'true' || q.get('comments') === '1') {
    const visibility = csv(q.get('comment_visibility')).filter((v) => v === 'reply' || v === 'note')
    const limit = Math.min(MAX_COMMENTS, Math.max(1, Number(q.get('comments_limit')) || DEFAULT_COMMENTS))
    const order = q.get('comments_order') === 'desc' ? desc : asc
    const where = visibility.length ? and(eq(ticketComments.ticketId, id), inArray(ticketComments.visibility, visibility)) : eq(ticketComments.ticketId, id)

    const [rows, countRow] = await Promise.all([
      db
        .select({
          id: ticketComments.id,
          comment: ticketComments.comment,
          visibility: ticketComments.visibility,
          authorType: ticketComments.authorType,
          createdAt: ticketComments.createdAt,
          editedAt: ticketComments.editedAt,
          splitTo: ticketComments.splitToTicketId,
          ccEmails: ticketComments.ccEmails,
          authorName: users.fullName,
          authorEmail: users.email,
        })
        .from(ticketComments)
        .leftJoin(users, eq(ticketComments.userId, users.id))
        .where(where)
        .orderBy(order(ticketComments.createdAt))
        .limit(limit),
      db.select({ n: sql<number>`count(*)::int` }).from(ticketComments).where(where),
    ])
    const files = rows.length
      ? await db
          .select({ commentId: commentAttachments.commentId, name: commentAttachments.fileName, url: commentAttachments.fileUrl })
          .from(commentAttachments)
          .where(inArray(commentAttachments.commentId, rows.map((r) => r.id)))
      : []
    const filesBy = new Map<string, { name: string; url: string }[]>()
    for (const f of files) filesBy.set(f.commentId, [...(filesBy.get(f.commentId) ?? []), { name: f.name, url: f.url }])
    commentsTotal = countRow[0]?.n ?? 0
    comments = rows.map((r) => ({
      id: r.id,
      author: { name: r.authorName ?? r.authorEmail ?? null, email: r.authorEmail ?? null, type: r.authorType },
      visibility: r.visibility,
      created_at: toWibIso(r.createdAt),
      edited_at: toWibIso(r.editedAt),
      text: htmlToText(r.comment),
      ...(includeHtml ? { html: r.comment } : {}),
      cc: r.ccEmails ?? [],
      attachments: filesBy.get(r.id) ?? [],
      split_to_ticket_id: r.splitTo ?? null,
    }))
  }

  return NextResponse.json({
    ticket: {
      id: t.id,
      title: t.title,
      description: htmlToText(t.description),
      ...(includeHtml ? { description_html: t.description } : {}),
      status: t.status,
      priority: t.priority,
      type: t.typeId ? { id: t.typeId, title: t.typeTitle, slug: t.typeSlug } : null,
      company: t.companyId ? { id: t.companyId, name: t.companyName } : null,
      team: t.teamName ?? null,
      customer: t.contactUserId ? (person.get(t.contactUserId) ?? null) : null,
      created_by: t.createdBy ? (person.get(t.createdBy) ?? null) : null,
      assignees: assignees.map((a) => ({ id: a.id, name: a.name, email: a.email })),
      tags: asRows<{ name: string }>(tagRows).map((r) => r.name),
      skills: asRows<{ name: string; is_primary: boolean }>(skillRows).map((r) => ({ name: r.name, is_primary: r.is_primary })),
      created_at: toWibIso(t.createdAt),
      updated_at: toWibIso(t.updatedAt),
      due_date: toWibIso(t.dueDate),
      url: `${siteUrl()}/tickets/${t.id}`,
    },
    time: {
      tracked_seconds: totalSeconds,
      tracked_hours: hours(totalSeconds),
      by_person: trackerPeople
        .map((p) => ({ name: p.name ?? p.email, email: p.email, tracked_hours: hours(bySeconds.get(p.id) ?? 0) }))
        .sort((a, b) => b.tracked_hours - a.tracked_hours),
    },
    ...(comments ? { comments_total: commentsTotal, comments_shown: comments.length, comments } : {}),
  })
}
