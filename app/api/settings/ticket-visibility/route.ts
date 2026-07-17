import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessTicketVisibilitySettings } from '@/lib/auth-utils'
import {
  parseTicketVisibilityRules,
  type TicketVisibilityRulesMap,
} from '@/lib/ticket-visibility'
import {
  getTicketVisibilityRules,
  setTicketVisibilityRules,
} from '@/lib/ticket-visibility-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessTicketVisibilitySettings((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rules = await getTicketVisibilityRules()
  return NextResponse.json({ data: rules })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessTicketVisibilitySettings((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const rules = parseTicketVisibilityRules(
    body && typeof body === 'object' && 'data' in body
      ? (body as { data: unknown }).data
      : body
  ) as TicketVisibilityRulesMap

  await setTicketVisibilityRules(rules)
  return NextResponse.json({ ok: true, data: rules })
}
