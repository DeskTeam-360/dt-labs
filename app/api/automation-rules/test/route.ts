import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessAutomationRules } from '@/lib/auth-utils'
import type { AutomationActions } from '@/lib/automation-actions-types'
import { testRuleOnTicket } from '@/lib/automation-test'
import type { OurConditionGroup } from '@/lib/condition-builder-utils'

/**
 * POST /api/automation-rules/test { ticket_id, rule: { event_type, conditions, actions, company_id } }
 * Checks the rule (also an unsaved one) against one ticket. Read only: nothing on the ticket changes.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessAutomationRules((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    ticket_id?: unknown
    rule?: { event_type?: string; conditions?: OurConditionGroup; actions?: AutomationActions; company_id?: string | null }
  }
  const ticketId = Number(String(body.ticket_id ?? '').replace('#', ''))
  if (!Number.isInteger(ticketId) || ticketId <= 0) return NextResponse.json({ error: 'Enter a ticket number' }, { status: 400 })
  const conditions = body.rule?.conditions
  if (!conditions || !Array.isArray(conditions.conditions)) {
    return NextResponse.json({ error: 'Add at least one condition first' }, { status: 400 })
  }

  const result = await testRuleOnTicket(
    { event_type: body.rule?.event_type, conditions, actions: body.rule?.actions ?? {}, company_id: body.rule?.company_id ?? null },
    ticketId
  )
  if (!result) return NextResponse.json({ error: `Ticket #${ticketId} was not found` }, { status: 404 })
  return NextResponse.json(result)
}
