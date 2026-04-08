import { db } from '@/lib/db'
import {
  slackTicketNotificationRules,
  tickets,
  teams,
  companies,
  users,
  ticketPriorities,
  ticketTypes,
} from '@/lib/db'
import { eq, asc } from 'drizzle-orm'

export type SlackTicketNotifyEvent = 'ticket_created' | 'status_changed' | 'client_reply'

export type SlackNotifyRuleFilter = {
  /** Default true */
  on_ticket_created?: boolean
  /** Default false */
  on_status_changed?: boolean
  /** Customer / portal comment on ticket — default false */
  on_client_reply?: boolean
  /** Non-empty = ticket must match one of these (null field on ticket = no match) */
  team_ids?: string[]
  priority_ids?: number[]
  company_ids?: string[]
  type_ids?: number[]
}

export type SlackTicketPayload = {
  id: number
  title: string
  status: string
  teamId: string | null
  priorityId: number | null
  companyId: string | null
  typeId: number | null
  previousStatus?: string
  /** Plain-text preview of reply (HTML stripped) */
  bodyPreview?: string
  actorName?: string
}

function parseFilter(raw: unknown): SlackNotifyRuleFilter {
  if (!raw || typeof raw !== 'object') return {}
  return raw as SlackNotifyRuleFilter
}

function eventAllowed(filter: SlackNotifyRuleFilter, event: SlackTicketNotifyEvent): boolean {
  if (event === 'ticket_created') return filter.on_ticket_created !== false
  if (event === 'status_changed') return filter.on_status_changed === true
  if (event === 'client_reply') return filter.on_client_reply === true
  return false
}

function matchesDimensions(filter: SlackNotifyRuleFilter, ticket: SlackTicketPayload): boolean {
  const { team_ids, priority_ids, company_ids, type_ids } = filter
  if (team_ids && team_ids.length > 0) {
    if (!ticket.teamId || !team_ids.includes(ticket.teamId)) return false
  }
  if (priority_ids && priority_ids.length > 0) {
    if (ticket.priorityId == null || !priority_ids.includes(ticket.priorityId)) return false
  }
  if (company_ids && company_ids.length > 0) {
    if (!ticket.companyId || !company_ids.includes(ticket.companyId)) return false
  }
  if (type_ids && type_ids.length > 0) {
    if (ticket.typeId == null || !type_ids.includes(ticket.typeId)) return false
  }
  return true
}

function maskForSlack(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

export function maskWebhookUrlForDisplay(url: string): string {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('slack.com')) return `${u.hostname}/…`
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs[segs.length - 1] || ''
    const tail = last.length > 4 ? last.slice(-4) : last
    return `hooks.slack.com/…/${tail}`
  } catch {
    return '(invalid URL)'
  }
}

export function isSlackIncomingWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      u.hostname === 'hooks.slack.com' &&
      u.pathname.startsWith('/services/')
    )
  } catch {
    return false
  }
}

async function loadLabels(ticket: SlackTicketPayload): Promise<{
  team?: string
  /** Always set for Slack body (name, or fallback text). */
  company: string
  priority?: string
  type?: string
}> {
  const [ticketRow] = await db
    .select({ companyId: tickets.companyId, createdBy: tickets.createdBy })
    .from(tickets)
    .where(eq(tickets.id, ticket.id))
    .limit(1)

  let companyId = ticket.companyId ?? ticketRow?.companyId ?? null
  const createdBy = ticketRow?.createdBy ?? null
  if (!companyId && createdBy) {
    const [u] = await db
      .select({ companyId: users.companyId })
      .from(users)
      .where(eq(users.id, createdBy))
      .limit(1)
    companyId = u?.companyId ?? null
  }

  let companyLabel = 'Not set'
  if (companyId) {
    const [c] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1)
    companyLabel = c?.name?.trim() || 'Unknown company'
  }

  const out: {
    team?: string
    company: string
    priority?: string
    type?: string
  } = { company: companyLabel }

  const jobs: Promise<void>[] = []
  if (ticket.teamId) {
    jobs.push(
      (async () => {
        const [r] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, ticket.teamId!)).limit(1)
        if (r?.name) out.team = r.name
      })()
    )
  }
  if (ticket.priorityId != null) {
    jobs.push(
      (async () => {
        const [r] = await db
          .select({ title: ticketPriorities.title })
          .from(ticketPriorities)
          .where(eq(ticketPriorities.id, ticket.priorityId!))
          .limit(1)
        if (r?.title) out.priority = r.title
      })()
    )
  }
  if (ticket.typeId != null) {
    jobs.push(
      (async () => {
        const [r] = await db
          .select({ title: ticketTypes.title })
          .from(ticketTypes)
          .where(eq(ticketTypes.id, ticket.typeId!))
          .limit(1)
        if (r?.title) out.type = r.title
      })()
    )
  }
  await Promise.all(jobs)
  return out
}

function buildMessage(
  event: SlackTicketNotifyEvent,
  ticket: SlackTicketPayload,
  labels: Awaited<ReturnType<typeof loadLabels>>,
  ticketUrl: string
): string {
  const link = `<${ticketUrl}|#${ticket.id}: ${maskForSlack(ticket.title, 120)}>`
  const companyLine = `*Company:* ${maskForSlack(labels.company, 200)}`
  const bits: string[] = []
  if (labels.team) bits.push(`Team: ${labels.team}`)
  if (labels.priority) bits.push(`Priority: ${labels.priority}`)
  if (labels.type) bits.push(`Type: ${labels.type}`)
  const meta = bits.length > 0 ? `\n${bits.join(' · ')}` : ''

  if (event === 'ticket_created') {
    return `*New ticket* ${link}\n${companyLine}${meta}\nStatus: \`${ticket.status}\``
  }
  if (event === 'client_reply') {
    const who = ticket.actorName ? maskForSlack(ticket.actorName, 80) : 'Client'
    const preview = ticket.bodyPreview?.trim()
      ? maskForSlack(ticket.bodyPreview.trim(), 220)
      : '(no text / attachment only)'
    return `*Client replied* ${link}\n${companyLine}${meta}\n_${who}:_ ${preview}`
  }
  const from = ticket.previousStatus ?? '?'
  return `*Ticket status changed* ${link}\n${companyLine}${meta}\n\`${from}\` → \`${ticket.status}\``
}

async function postWebhook(url: string, text: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Slack webhook ${res.status}: ${body.slice(0, 200)}`)
  }
}

/**
 * Fire-and-forget from API routes: matches enabled rules and POSTs to each webhook.
 */
export async function notifySlackTicketEvent(
  event: SlackTicketNotifyEvent,
  ticket: SlackTicketPayload
): Promise<void> {
  try {
    const rules = await db
      .select()
      .from(slackTicketNotificationRules)
      .where(eq(slackTicketNotificationRules.isEnabled, true))
      .orderBy(asc(slackTicketNotificationRules.sortOrder), asc(slackTicketNotificationRules.createdAt))

    const matched = rules.filter((r) => {
      const f = parseFilter(r.filter)
      if (!eventAllowed(f, event)) return false
      return matchesDimensions(f, ticket)
    })
    if (matched.length === 0) return

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') || 'http://localhost:3000'
    const ticketUrl = `${baseUrl}/tickets/${ticket.id}`
    const labels = await loadLabels(ticket)
    const text = buildMessage(event, ticket, labels, ticketUrl)

    await Promise.all(
      matched.map((r) =>
        postWebhook(r.webhookUrl, text).catch((err) => {
          console.error('[slack-ticket-notify] webhook failed', r.id, err)
        })
      )
    )
  } catch (e) {
    console.error('[slack-ticket-notify]', e)
  }
}
