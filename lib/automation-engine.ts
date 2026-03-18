/**
 * Automation rules engine: evaluate conditions and apply actions when tickets are created/updated.
 */
import { db } from '@/lib/db'
import { sendAutomationLog } from '@/lib/automation-log-webhook'
import {
  automationRules,
  tickets,
  ticketPriorities,
  ticketTypes,
  teams,
  ticketTags,
  ticketComments,
  ticketChecklist,
} from '@/lib/db'
import { eq, and, desc } from 'drizzle-orm'
import type { OurCondition, OurConditionGroup, OurConditionLeaf } from './condition-builder-utils'
import type { AutomationActions } from './automation-actions-types'

export interface TicketContext {
  id: number
  title?: string | null
  description?: string | null
  status?: string | null
  priority_slug?: string | null
  company_id?: string | null
  created_via?: string | null
  team_id?: string | null
  visibility?: string | null
  sender_email?: string | null
  sender_domain?: string | null
  assignee_ids?: string[]
}

function isLeaf(c: OurCondition): c is OurConditionLeaf {
  return !('conditions' in c) || !Array.isArray((c as OurConditionGroup).conditions)
}

function evalLeaf(leaf: OurConditionLeaf, ctx: TicketContext): boolean {
  const field = String(leaf.field || '').toLowerCase()
  const op = String(leaf.operator || '=').toLowerCase()
  const expectVal = leaf.value

  const getField = (): unknown => {
    switch (field) {
      case 'subject':
        return (ctx.title ?? '') || ''
      case 'description':
        return (ctx.description ?? '') || ''
      case 'priority':
        return (ctx.priority_slug ?? '') || ''
      case 'status':
        return (ctx.status ?? '') || ''
      case 'sender_domain':
        return (ctx.sender_domain ?? '') || ''
      case 'sender_email':
        return (ctx.sender_email ?? '') || ''
      case 'assignee_id':
        return (ctx.assignee_ids ?? [])[0] ?? ''
      case 'created_via':
        return (ctx.created_via ?? '') || ''
      default:
        return ''
    }
  }

  const actual = getField()
  const actualStr = String(actual ?? '').toLowerCase()
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
      const list = String(expectVal ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      return list.length > 0 && list.includes(actualStr)
    }
    case 'notin': {
      const list = String(expectVal ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
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

export async function runAutomationRules(
  eventType: 'ticket_created' | 'ticket_updated',
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

    if (actions.add_note?.trim() && actions.add_note_user_id?.trim()) {
      await db.insert(ticketComments).values({
        ticketId: ctx.id,
        userId: actions.add_note_user_id,
        comment: actions.add_note.trim(),
        visibility: 'note',
        authorType: 'automation',
      })
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

    break
  }
}
