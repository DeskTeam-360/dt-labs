import { auth } from '@/auth'
import { db, slackTicketNotificationRules } from '@/lib/db'
import { isSlackIncomingWebhookUrl, maskWebhookUrlForDisplay } from '@/lib/slack-ticket-notify'
import { isAdmin } from '@/lib/auth-utils'
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function normalizeFilter(body: Record<string, unknown>) {
  const f = (body.filter && typeof body.filter === 'object' ? body.filter : {}) as Record<string, unknown>
  return {
    on_ticket_created: f.on_ticket_created !== false,
    on_status_changed: f.on_status_changed === true,
    on_client_reply: f.on_client_reply === true,
    team_ids: Array.isArray(f.team_ids) ? f.team_ids.filter((x): x is string => typeof x === 'string') : [],
    priority_ids: Array.isArray(f.priority_ids)
      ? f.priority_ids.filter((x): x is number => typeof x === 'number' && Number.isInteger(x))
      : [],
    company_ids: Array.isArray(f.company_ids)
      ? f.company_ids.filter((x): x is string => typeof x === 'string')
      : [],
    type_ids: Array.isArray(f.type_ids)
      ? f.type_ids.filter((x): x is number => typeof x === 'number' && Number.isInteger(x))
      : [],
  }
}

function dbErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/slack_ticket_notification_rules|42P01|relation .* does not exist/i.test(msg)) {
    return (
      'Database: table slack_ticket_notification_rules is missing. ' +
      'Run migration `drizzle/migrations/025_slack_ticket_notification_rules.sql` on your database and try again.'
    )
  }
  return msg || 'Database error'
}

/** GET /api/slack-notification-rules */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const role = (session.user as { role?: string }).role
    if (!isAdmin(role)) {
      return NextResponse.json({ error: 'Forbidden — hanya role admin.' }, { status: 403 })
    }

    const rows = await db
      .select()
      .from(slackTicketNotificationRules)
      .orderBy(asc(slackTicketNotificationRules.sortOrder), asc(slackTicketNotificationRules.createdAt))

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name ?? '',
      webhook_url_masked: maskWebhookUrlForDisplay(r.webhookUrl),
      is_enabled: r.isEnabled ?? true,
      filter: r.filter,
      sort_order: r.sortOrder ?? 0,
      created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
      updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    }))

    return NextResponse.json(data)
  } catch (e) {
    console.error('[GET /api/slack-notification-rules]', e)
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 500 })
  }
}

/** POST /api/slack-notification-rules */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const webhookUrl = typeof body.webhook_url === 'string' ? body.webhook_url.trim() : ''
  if (!isSlackIncomingWebhookUrl(webhookUrl)) {
    return NextResponse.json(
      { error: 'webhook_url must be a Slack Incoming Webhook (https://hooks.slack.com/services/...)' },
      { status: 400 }
    )
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 255) : null
  const sortOrder = typeof body.sort_order === 'number' && Number.isInteger(body.sort_order) ? body.sort_order : 0
  const isEnabled = body.is_enabled !== false
  const filter = normalizeFilter(body)

  const [created] = await db
    .insert(slackTicketNotificationRules)
    .values({
      name: name || null,
      webhookUrl,
      isEnabled,
      filter,
      sortOrder,
      updatedAt: new Date(),
    })
    .returning()

  if (!created) {
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  }

  return NextResponse.json({
    id: created.id,
    name: created.name ?? '',
    webhook_url_masked: maskWebhookUrlForDisplay(created.webhookUrl),
    is_enabled: created.isEnabled ?? true,
    filter: created.filter,
    sort_order: created.sortOrder ?? 0,
    created_at: created.createdAt ? new Date(created.createdAt).toISOString() : '',
    updated_at: created.updatedAt ? new Date(created.updatedAt).toISOString() : '',
  })
}
