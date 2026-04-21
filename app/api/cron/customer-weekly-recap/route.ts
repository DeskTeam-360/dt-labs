import { NextRequest, NextResponse } from 'next/server'

import {
  listTeamIdsFromDb,
  materializeCustomerWeeklyRecapForTeams,
} from '@/lib/customer-weekly-recap-materialize'

function cronAuthResult(request: NextRequest): 'ok' | 'missing_secret' | 'bad_key' {
  const secret = process.env.CUSTOMER_WEEKLY_RECAP_CRON_SECRET ?? process.env.COMPANY_DAILY_ACTIVE_CRON_SECRET
  if (!secret) return 'missing_secret'
  const authHeader = request.headers.get('authorization')
  const apiKey = request.headers.get('x-api-key')
  const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : apiKey
  if (key !== secret) return 'bad_key'
  return 'ok'
}

/**
 * POST /api/cron/customer-weekly-recap
 * Materializes last N ISO weeks for all teams (expensive — schedule off-peak).
 *
 * Auth: CUSTOMER_WEEKLY_RECAP_CRON_SECRET or fallback COMPANY_DAILY_ACTIVE_CRON_SECRET.
 * Body JSON: { "weeks_back": 12 } (optional, default 12, max 104).
 */
export async function POST(request: NextRequest) {
  const auth = cronAuthResult(request)
  if (auth === 'missing_secret') {
    return NextResponse.json(
      { error: 'CUSTOMER_WEEKLY_RECAP_CRON_SECRET (or COMPANY_DAILY_ACTIVE_CRON_SECRET) is not set' },
      { status: 503 }
    )
  }
  if (auth === 'bad_key') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let weeksBack = 12
  try {
    const body = await request.json().catch(() => null)
    if (body && typeof body === 'object' && typeof (body as { weeks_back?: unknown }).weeks_back === 'number') {
      weeksBack = Math.floor((body as { weeks_back: number }).weeks_back)
    }
  } catch {
    /* ignore */
  }
  const wb = Number.isFinite(weeksBack) ? Math.min(104, Math.max(1, weeksBack)) : 12

  try {
    const teamIds = await listTeamIdsFromDb()
    const results = await materializeCustomerWeeklyRecapForTeams(teamIds, wb)
    return NextResponse.json({
      ok: true,
      weeks_back: wb,
      teams: results.length,
      results,
    })
  } catch (e) {
    console.error('[cron/customer-weekly-recap]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
