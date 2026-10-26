import { eq, inArray } from 'drizzle-orm'

import { companies, db, tags, teams, tickets, ticketStatuses, ticketTypes, users } from '@/lib/db'

import type { AutomationActions } from './automation-actions-types'
import { AUTOMATION_REAL_SENDER } from './automation-constants'
import { conditionLeafPasses, conditionsPass, describeLeaf, loadAutomationTicketContext, type TicketContext } from './automation-engine'
import type { OurCondition, OurConditionGroup, OurConditionLeaf } from './condition-builder-utils'
import { detectRealSender } from './email-real-sender'

export type RuleCheck = { text: string; passed: boolean; depth: number; group?: 'AND' | 'OR' }

export type RuleTestResult = {
  ticket: { id: number; title: string }
  would_run: boolean
  event_note: string | null
  company_ok: boolean
  company_note: string | null
  checks: RuleCheck[]
  actions: string[]
  context_note: string
}

function isLeaf(c: OurCondition): c is OurConditionLeaf {
  return !('conditions' in c) || !Array.isArray((c as OurConditionGroup).conditions)
}

/** Every condition with pass / fail, nested groups indented. */
function explain(cond: OurConditionGroup, ctx: TicketContext, depth: number, out: RuleCheck[]) {
  for (const c of cond.conditions ?? []) {
    if (isLeaf(c)) {
      out.push({ text: describeLeaf(c, ctx, true), passed: conditionLeafPasses(c, ctx), depth })
    } else {
      const g = c as OurConditionGroup
      out.push({
        text: (g.operator ?? 'AND').toUpperCase() === 'OR' ? 'Any of these:' : 'All of these:',
        passed: conditionsPass(g, ctx),
        depth,
        group: (g.operator ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND',
      })
      explain(g, ctx, depth + 1, out)
    }
  }
}

/** What the actions would do on this ticket, in words. Nothing is written. */
async function describeActions(actions: AutomationActions, ctx: TicketContext): Promise<string[]> {
  const out: string[] = []
  const name = async <T extends { id: unknown }>(rows: T[], pick: (r: T) => string) => (rows[0] ? pick(rows[0]) : 'unknown')

  if (actions.team_id) {
    const r = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.id, actions.team_id)).limit(1)
    out.push(`Team becomes ${await name(r, (x) => x.name)}`)
  }
  if (actions.company_id) {
    const r = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, actions.company_id)).limit(1)
    out.push(`Company becomes ${await name(r, (x) => x.name)}`)
  }
  if (actions.contact_user_id) {
    if (actions.contact_user_id === AUTOMATION_REAL_SENDER) {
      out.push(
        ctx.real_sender_email
          ? `Contact becomes the real sender: ${ctx.real_sender_email}`
          : 'Contact: the real sender. Nothing would change: this ticket has no "via Service" sender.'
      )
    } else {
      const r = await db.select({ id: users.id, name: users.fullName, email: users.email }).from(users).where(eq(users.id, actions.contact_user_id)).limit(1)
      out.push(`Contact becomes ${await name(r, (x) => `${x.name || x.email} (${x.email})`)}`)
    }
  }
  if (actions.assignee_ids?.length) {
    const r = await db.select({ name: users.fullName, email: users.email }).from(users).where(inArray(users.id, actions.assignee_ids))
    out.push(`Assign ${r.map((x) => x.name || x.email).join(', ')}`)
  }
  if (actions.priority !== undefined && actions.priority !== null && `${actions.priority}`.trim() !== '') {
    out.push(`Priority becomes ${actions.priority} (was ${ctx.priority ?? 'none'})`)
  }
  if (actions.status_slug) {
    const r = await db.select({ id: ticketStatuses.id, title: ticketStatuses.title }).from(ticketStatuses).where(eq(ticketStatuses.slug, actions.status_slug)).limit(1)
    out.push(`Status becomes ${await name(r, (x) => x.title)} (was ${ctx.status ?? 'none'})`)
  }
  if (actions.type_slug) {
    const r = await db.select({ id: ticketTypes.id, title: ticketTypes.title }).from(ticketTypes).where(eq(ticketTypes.slug, actions.type_slug)).limit(1)
    out.push(`Ticket type becomes ${await name(r, (x) => x.title)}`)
  }
  if (actions.ticket_type) out.push(`Classification becomes ${actions.ticket_type}`)
  if (actions.tag_ids?.length) {
    const r = await db.select({ name: tags.name }).from(tags).where(inArray(tags.id, actions.tag_ids))
    out.push(`Add tags: ${r.map((x) => x.name).join(', ')}`)
  }
  if (actions.add_note && actions.add_note.replace(/<[^>]+>/g, '').trim()) out.push('Add a note from Automation')
  if (actions.add_checklist_items?.length) out.push(`Add ${actions.add_checklist_items.length} checklist item(s)`)
  return out
}

const EVENT_TEXT: Record<string, string> = {
  ticket_created: 'when a ticket is created',
  ticket_updated: 'when a ticket is updated',
  ticket_comment_added: 'when a comment is added',
  ticket_reply_added: 'when a reply is added',
  ticket_note_added: 'when a note is added',
  time_trigger: 'on the time trigger',
}

/**
 * Checks a rule (saved or still being edited) against one ticket without changing anything:
 * which conditions pass, whether it would run, and what its actions would do.
 */
export async function testRuleOnTicket(
  rule: { event_type?: string; conditions: OurConditionGroup; actions: AutomationActions; company_id?: string | null },
  ticketId: number
): Promise<RuleTestResult | null> {
  const ctx = await loadAutomationTicketContext(ticketId)
  if (!ctx) return null

  // The sender only exists while an email is processed; rebuild it from the person who created the ticket.
  const [row] = await db
    .select({ title: tickets.title, email: users.email, name: users.fullName })
    .from(tickets)
    .leftJoin(users, eq(tickets.createdBy, users.id))
    .where(eq(tickets.id, ticketId))
    .limit(1)
  const senderEmail = row?.email?.toLowerCase() ?? null
  if (senderEmail) {
    ctx.sender_email = senderEmail
    ctx.sender_domain = senderEmail.split('@')[1] ?? null
    const real = detectRealSender({ from: row?.name ? `${row.name} <${senderEmail}>` : senderEmail })
    if (real) {
      ctx.real_sender_email = real.email
      ctx.real_sender_domain = real.domain
    }
  }

  const checks: RuleCheck[] = []
  explain(rule.conditions, ctx, 0, checks)
  const conditionsOk = conditionsPass(rule.conditions, ctx)
  const companyOk = !rule.company_id || rule.company_id === ctx.company_id
  let companyNote: string | null = null
  if (rule.company_id && !companyOk) {
    const [c] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, rule.company_id)).limit(1)
    companyNote = `The rule only runs for ${c?.name ?? 'another company'}, and this ticket belongs to a different company.`
  }

  return {
    ticket: { id: ctx.id, title: row?.title ?? ctx.title ?? '' },
    would_run: conditionsOk && companyOk,
    event_note: rule.event_type ? `It is checked ${EVENT_TEXT[rule.event_type] ?? rule.event_type}.` : null,
    company_ok: companyOk,
    company_note: companyNote,
    checks,
    actions: await describeActions(rule.actions ?? {}, ctx),
    context_note:
      'Sender fields come from the person who created the ticket, and the Reply-To header is not stored, so Real Sender is read from the sender name only. Comment fields are empty in a test.',
  }
}
