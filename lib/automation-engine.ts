/**
 * Automation rules engine: evaluate conditions and apply actions when tickets are
 * created, updated, or when a new comment/reply/note is added.
 */
import { db } from '@/lib/db'
import { sendAutomationLog } from '@/lib/automation-log-webhook'
import {
  automationRules,
  tickets,
  ticketPriorities,
  ticketTypes,
  ticketAssignees,
  teams,
  ticketTags,
  ticketComments,
  ticketChecklist,
} from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import type { OurCondition, OurConditionGroup, OurConditionLeaf } from './condition-builder-utils'
import type { AutomationActions } from './automation-actions-types'
import { AUTOMATION_NOTE_USER_ID } from './automation-constants'
import { diffTicketSnapshots, loadTicketActivitySnapshot, logTicketActivity } from './ticket-activity-log'

function automationNoteHtmlHasText(html: string | undefined | null): boolean {
  if (!html?.trim()) return false
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0
}

export interface TicketContext {
  id: number
  /** Ticket title (portal & API). Condition field `subject` also reads this (email-style name). */
  title?: string | null
  description?: string | null
  status?: string | null
  priority_slug?: string | null
  /** Ticket type slug (ticket_types.slug), for conditions e.g. Type = bug */
  type_slug?: string | null
  company_id?: string | null
  created_via?: string | null
  team_id?: string | null
  visibility?: string | null
  sender_email?: string | null
  sender_domain?: string | null
  assignee_ids?: string[]
  /** Set for event ticket_comment_added: reply | note */
  comment_visibility?: string | null
  /** Set for event ticket_comment_added: agent | customer | automation */
  comment_author_type?: string | null
}

export type AutomationEventType =
  | 'ticket_created'
  | 'ticket_updated'
  | 'ticket_comment_added'

function isLeaf(c: OurCondition): c is OurConditionLeaf {
  return !('conditions' in c) || !Array.isArray((c as OurConditionGroup).conditions)
}

function isEmptyAutomationValue(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true
  if (typeof raw === 'string') return raw.trim() === ''
  if (Array.isArray(raw)) return raw.length === 0
  return false
}

function evalLeaf(leaf: OurConditionLeaf, ctx: TicketContext): boolean {
  const field = String(leaf.field || '').toLowerCase()
  const op = String(leaf.operator || '=')
    .toLowerCase()
    .replace(/\s+/g, '')
  const expectVal = leaf.value

  const getRaw = (): unknown => {
    switch (field) {
      case 'subject':
      case 'title':
        return ctx.title ?? null
      case 'description':
        return ctx.description ?? null
      case 'priority':
        return ctx.priority_slug ?? null
      case 'type':
      case 'type_slug':
        return ctx.type_slug ?? null
      case 'status':
        return ctx.status ?? null
      case 'sender_domain':
        return ctx.sender_domain ?? null
      case 'sender_email':
        return ctx.sender_email ?? null
      case 'assignee_id':
        return (ctx.assignee_ids ?? [])[0] ?? null
      case 'created_via':
        return ctx.created_via ?? null
      case 'comment_visibility':
        return ctx.comment_visibility ?? null
      case 'comment_author_type':
        return ctx.comment_author_type ?? null
      default:
        return null
    }
  }

  const raw = getRaw()

  if (op === 'null' || op === 'isnull') {
    return isEmptyAutomationValue(raw)
  }
  if (op === 'notnull' || op === 'isnotnull') {
    return !isEmptyAutomationValue(raw)
  }

  const actualStr = raw === null || raw === undefined ? '' : String(raw).toLowerCase()
  const expectStr = String(expectVal ?? '').toLowerCase()

  switch (op) {
    case '=':
      return actualStr === expectStr
    case '!=':
      return actualStr !== expectStr
    case 'contains':
      return actualStr.includes(expectStr)
    case 'beginswith':
      return actualStr.startsWith(expectStr)
    case 'endswith':
      return actualStr.endsWith(expectStr)
    case 'in': {
      const list = String(expectVal ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      return list.length > 0 && list.includes(actualStr)
    }
    case 'notin': {
      const list = String(expectVal ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      return list.length === 0 || !list.includes(actualStr)
    }
    default:
      return actualStr === expectStr
  }
}

function evalConditions(cond: OurConditionGroup, ctx: TicketContext): boolean {
  const operator = (cond.operator ?? 'AND').toUpperCase()
  const conditions = cond.conditions ?? []

  if (conditions.length === 0) return true

  const results = conditions.map((c) => {
    if (isLeaf(c)) return evalLeaf(c, ctx)
    return evalConditions(c as OurConditionGroup, ctx)
  })

  return operator === 'OR' ? results.some(Boolean) : results.every(Boolean)
}

/** Load ticket + assignees for automation context (shared across triggers). */
export async function loadAutomationTicketContext(ticketId: number): Promise<TicketContext | null> {
  const [row] = await db
    .select({
      t: tickets,
      prioritySlug: ticketPriorities.slug,
      typeSlug: ticketTypes.slug,
    })
    .from(tickets)
    .leftJoin(ticketPriorities, eq(tickets.priorityId, ticketPriorities.id))
    .leftJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
    .where(eq(tickets.id, ticketId))
    .limit(1)
  if (!row?.t) return null
  const assigneeRows = await db
    .select({ userId: ticketAssignees.userId })
    .from(ticketAssignees)
    .where(eq(ticketAssignees.ticketId, ticketId))
  const t = row.t
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority_slug: row.prioritySlug ?? null,
    type_slug: row.typeSlug ?? null,
    company_id: t.companyId,
    created_via: t.createdVia,
    team_id: t.teamId,
    visibility: t.visibility,
    assignee_ids: assigneeRows.map((r) => r.userId),
  }
}

/**
 * After a human or customer comment is saved. Skips author_type automation to avoid loops.
 */
export async function runTicketCommentAutomation(
  ticketId: number,
  comment: { visibility: string; authorType: string }
): Promise<void> {
  if (comment.authorType === 'automation') return
  const base = await loadAutomationTicketContext(ticketId)
  if (!base) return
  await runAutomationRules('ticket_comment_added', {
    ...base,
    comment_visibility: comment.visibility ?? 'reply',
    comment_author_type: comment.authorType ?? 'agent',
  })
}

export async function runAutomationRules(
  eventType: AutomationEventType,
  ctx: TicketContext
): Promise<void> {
  const rows = await db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.eventType, eventType),
        eq(automationRules.status, true)
      )
    )
    /** Higher `priority` value runs first; every matching rule runs (not only the first). */
    .orderBy(desc(automationRules.priority))

  for (const rule of rows) {
    if (!rule.conditions || typeof rule.conditions !== 'object') continue
    const cond = rule.conditions as OurConditionGroup
    if (!('operator' in cond) || !Array.isArray(cond.conditions)) continue

    const companyMatch = !rule.companyId || rule.companyId === ctx.company_id
    if (!companyMatch) continue
    if (!evalConditions(cond, ctx)) continue

    sendAutomationLog({
      event: 'automation_matched',
      ticket_id: ctx.id,
      email: ctx.sender_email ?? '',
      subject: ctx.title ?? '',
      detail: `rule=${rule.name ?? rule.id} event=${eventType}`,
    }).catch(() => {})

    const actions = (rule.actions || {}) as AutomationActions
    const updates: Record<string, unknown> = {}

    if (actions.priority_slug) {
      const [p] = await db
        .select({ id: ticketPriorities.id })
        .from(ticketPriorities)
        .where(eq(ticketPriorities.slug, String(actions.priority_slug)))
        .limit(1)
      if (p) updates.priorityId = p.id
    }
    if (actions.type_slug) {
      const [t] = await db
        .select({ id: ticketTypes.id })
        .from(ticketTypes)
        .where(eq(ticketTypes.slug, String(actions.type_slug)))
        .limit(1)
      if (t) updates.typeId = t.id
    }
    if (actions.team_id) {
      const [tm] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, actions.team_id)).limit(1)
      if (tm) updates.teamId = tm.id
    }
    if (actions.visibility) {
      updates.visibility = actions.visibility
    }

    const willMutateTicket =
      Object.keys(updates).length > 0 || Boolean(actions.tag_ids?.length)
    const beforeAuto = willMutateTicket ? await loadTicketActivitySnapshot(ctx.id) : null

    if (Object.keys(updates).length > 0) {
      await db
        .update(tickets)
        .set({ ...updates, updatedAt: new Date() } as typeof tickets.$inferInsert)
        .where(eq(tickets.id, ctx.id))
    }

    if (actions.tag_ids?.length) {
      const existing = await db
        .select({ tagId: ticketTags.tagId })
        .from(ticketTags)
        .where(eq(ticketTags.ticketId, ctx.id))
      const existingIds = new Set(existing.map((r) => r.tagId))
      const toAdd = actions.tag_ids.filter((id) => !existingIds.has(id))
      if (toAdd.length > 0) {
        await db.insert(ticketTags).values(
          toAdd.map((tagId) => ({
            ticketId: ctx.id,
            tagId,
          }))
        )
      }
    }

    if (beforeAuto) {
      const afterAuto = await loadTicketActivitySnapshot(ctx.id)
      if (afterAuto) {
        const diff = diffTicketSnapshots(beforeAuto, afterAuto)
        if (Object.keys(diff).length > 0) {
          await logTicketActivity({
            ticketId: ctx.id,
            actorUserId: null,
            actorRole: 'automation',
            action: 'ticket_updated',
            metadata: {
              source: 'automation_rule',
              rule_id: rule.id,
              rule_name: rule.name ?? null,
              changed_keys: Object.keys(diff),
              changes: diff,
            },
          })
        }
      }
    }

    if (automationNoteHtmlHasText(actions.add_note)) {
      const noteUserId = actions.add_note_user_id?.trim() || AUTOMATION_NOTE_USER_ID
      const [noteRow] = await db
        .insert(ticketComments)
        .values({
          ticketId: ctx.id,
          userId: noteUserId,
          comment: actions.add_note!.trim(),
          visibility: 'note',
          authorType: 'automation',
        })
        .returning({ id: ticketComments.id })
      if (noteRow) {
        await logTicketActivity({
          ticketId: ctx.id,
          actorUserId: noteUserId,
          actorRole: 'automation',
          action: 'comment_added',
          relatedCommentId: noteRow.id,
          metadata: {
            visibility: 'note',
            author_type: 'automation',
            source: 'automation_rule',
            rule_id: rule.id,
            rule_name: rule.name ?? null,
          },
        })
      }
    }

    if (actions.add_checklist_items?.length) {
      const items = actions.add_checklist_items
        .map((t) => (typeof t === 'string' ? t : '').trim())
        .filter(Boolean)
      if (items.length > 0) {
        const existing = await db
          .select({ title: ticketChecklist.title, orderIndex: ticketChecklist.orderIndex })
          .from(ticketChecklist)
          .where(eq(ticketChecklist.ticketId, ctx.id))
        const existingTitles = new Set(existing.map((r) => r.title?.toLowerCase() ?? ''))
        const maxOrder = existing.reduce((m, r) => Math.max(m, r.orderIndex ?? 0), -1)
        const toAdd = items.filter((title) => !existingTitles.has(title.toLowerCase()))
        if (toAdd.length > 0) {
          await db.insert(ticketChecklist).values(
            toAdd.map((title, idx) => ({
              ticketId: ctx.id,
              title,
              isCompleted: false,
              orderIndex: maxOrder + 1 + idx,
            }))
          )
        }
      }
    }

    const fresh = await loadAutomationTicketContext(ctx.id)
    if (fresh) {
      ctx.title = fresh.title
      ctx.description = fresh.description
      ctx.status = fresh.status
      ctx.priority_slug = fresh.priority_slug
      ctx.type_slug = fresh.type_slug
      ctx.company_id = fresh.company_id
      ctx.created_via = fresh.created_via
      ctx.team_id = fresh.team_id
      ctx.visibility = fresh.visibility
      ctx.assignee_ids = fresh.assignee_ids
    }
  }
}
