import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { pageInfo, ticketVisibility, toWibIso } from '@/lib/api-v1'
import { db, ticketActivityLog, tickets, users } from '@/lib/db'
import { formatTicketActivityAction } from '@/lib/ticket-activity-labels'
import { withEntityLabels } from '@/lib/ticket-activity-log'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

type Labels = Partial<Record<'teams' | 'tags' | 'contacts' | 'assignees' | 'statuses' | 'companies' | 'types', Record<string, string>>>

const FIELD_NAMES: Record<string, string> = {
  title: 'title',
  description: 'description',
  shortNote: 'short_note',
  status: 'status',
  visibility: 'visibility',
  teamId: 'team',
  typeId: 'type',
  ticketType: 'ticket_type',
  priority: 'priority',
  companyId: 'company',
  contactUserId: 'customer',
  dueDateIso: 'due_date',
  assignee_ids: 'assignees',
  tag_ids: 'tags',
  skills: 'skills',
}

/** A changed value written for people: ids replaced by names, dates in WIB, long texts shortened. */
function readable(key: string, value: unknown, labels: Labels): unknown {
  const pick = (map: Record<string, string> | undefined, v: unknown) => (v == null || v === '' ? null : (map?.[String(v)] ?? String(v)))
  if (key === 'teamId') return pick(labels.teams, value)
  if (key === 'typeId') return pick(labels.types, value)
  if (key === 'companyId') return pick(labels.companies, value)
  if (key === 'contactUserId') return pick(labels.contacts, value)
  if (key === 'status') return pick(labels.statuses, value) ?? value
  if (key === 'assignee_ids') return Array.isArray(value) ? value.map((v) => pick(labels.assignees, v)) : value
  if (key === 'tag_ids') return Array.isArray(value) ? value.map((v) => pick(labels.tags, v)) : value
  if (key === 'dueDateIso') return typeof value === 'string' ? toWibIso(new Date(value)) : null
  if (typeof value === 'string' && value.length > 300) return `${value.slice(0, 300)}...`
  return value ?? null
}

/**
 * GET /api/v1/tickets/{id}/activity - the ticket's history, newest first (order=asc for oldest first): who changed what and when,
 * with the old and new value of every field in words. Entries made through the API say so (`via_api`, `via`).
 * limit (default 50, max 200) and offset.
 * Auth: browser session or an API key with the `ticket-detail:read` scope.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getApiUser(request, 'ticket-detail:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = Number((await ctx.params).id.replace(/^#/, ''))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid ticket number' }, { status: 400 })
  const q = new URL(request.url).searchParams
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.get('limit')) || DEFAULT_LIMIT))
  const offset = Math.max(0, Number(q.get('offset')) || 0)
  const order = q.get('order') === 'asc' ? asc : desc

  const visible = await ticketVisibility(me)
  const [t] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(visible ? and(eq(tickets.id, id), eq(tickets.ticketType, 'support'), visible) : and(eq(tickets.id, id), eq(tickets.ticketType, 'support')))
    .limit(1)
  if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const [countRow, rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(ticketActivityLog).where(eq(ticketActivityLog.ticketId, id)),
    db
      .select({
        id: ticketActivityLog.id,
        action: ticketActivityLog.action,
        actorRole: ticketActivityLog.actorRole,
        metadata: ticketActivityLog.metadata,
        createdAt: ticketActivityLog.createdAt,
        actorName: users.fullName,
        actorEmail: users.email,
      })
      .from(ticketActivityLog)
      .leftJoin(users, eq(ticketActivityLog.actorUserId, users.id))
      .where(eq(ticketActivityLog.ticketId, id))
      .orderBy(order(ticketActivityLog.createdAt))
      .limit(limit)
      .offset(offset),
  ])
  const total = countRow[0]?.n ?? 0

  const labelled = await withEntityLabels(rows)
  const entries = labelled.map((r) => {
    const meta = r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata) ? (r.metadata as Record<string, unknown>) : {}
    const labels = (meta.entity_labels ?? {}) as Labels
    const changes = meta.changes && typeof meta.changes === 'object' && !Array.isArray(meta.changes) ? (meta.changes as Record<string, { from: unknown; to: unknown }>) : {}
    return {
      id: r.id,
      at: toWibIso(r.createdAt),
      action: r.action,
      summary: formatTicketActivityAction(r.action, r.actorRole, meta),
      actor: r.actorRole === 'automation' || r.actorRole === 'system' ? { full_name: r.actorRole, email: null, role: r.actorRole } : r.actorEmail ? { full_name: r.actorName ?? r.actorEmail, email: r.actorEmail, role: r.actorRole } : null,
      via_api: meta.source === 'api',
      via: meta.source === 'api' && typeof meta.via === 'string' ? meta.via : null,
      changes: Object.entries(changes)
        .filter(([k]) => k !== 'via')
        .map(([k, v]) => ({ field: FIELD_NAMES[k] ?? k, from: readable(k, v?.from, labels), to: readable(k, v?.to, labels) })),
      ...(typeof meta.body_preview === 'string' && meta.body_preview ? { comment_preview: meta.body_preview, comment_visibility: meta.visibility ?? null } : {}),
    }
  })

  return NextResponse.json({ ticket_id: id, total, limit, offset, ...pageInfo(offset, entries.length, total), entries })
}
