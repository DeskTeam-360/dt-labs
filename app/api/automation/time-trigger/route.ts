import { and, eq, inArray, lt, not } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { loadAutomationTicketContext, runAutomationRules } from '@/lib/automation-engine'
import { automationRules, db, tickets } from '@/lib/db'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  // Allow internal calls with CRON_SECRET header, or from localhost
  const secret = req.headers.get('x-cron-secret')
  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const isLocal = forwarded === '' || forwarded.startsWith('127.') || forwarded.startsWith('::1')

  if (CRON_SECRET && secret !== CRON_SECRET && !isLocal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Load all active time_trigger rules
  const rules = await db
    .select({ id: automationRules.id })
    .from(automationRules)
    .where(and(eq(automationRules.eventType, 'time_trigger'), eq(automationRules.status, 'active')))

  if (rules.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No active time_trigger rules' })
  }

  // Load all non-closed tickets updated more than 1 day ago (minimum window to avoid over-processing)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const candidates = await db
    .select({ id: tickets.id, updatedAt: tickets.updatedAt })
    .from(tickets)
    .where(and(
      not(inArray(tickets.status, ['closed'])),
      lt(tickets.updatedAt, oneDayAgo),
    ))

  let processed = 0
  let triggered = 0

  for (const ticket of candidates) {
    const ctx = await loadAutomationTicketContext(ticket.id)
    if (!ctx) continue

    const daysSinceUpdated = ticket.updatedAt
      ? (Date.now() - new Date(ticket.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      : null

    const ctxWithTime = { ...ctx, days_since_updated: daysSinceUpdated }

    await runAutomationRules('time_trigger', ctxWithTime)
    processed++
    triggered++
  }

  return NextResponse.json({ ok: true, processed, triggered, rules: rules.length })
}
