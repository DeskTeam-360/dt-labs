import { NextRequest, NextResponse } from 'next/server'

import { ensureCapacityForDate, isValidYmd, listYmd, wibTodayYmd } from '@/lib/user-capacity'

const MAX_BACKFILL_DAYS = 120

function cronAuthResult(request: NextRequest): 'ok' | 'missing_secret' | 'bad_key' {
  const secret = process.env.USER_CAPACITY_CRON_SECRET ?? process.env.SYNC_INBOX_CRON_SECRET
  if (!secret) return 'missing_secret'
  const authHeader = request.headers.get('authorization')
  const apiKey = request.headers.get('x-api-key')
  const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : apiKey
  if (key !== secret) return 'bad_key'
  return 'ok'
}

/**
 * POST /api/cron/user-daily-capacity
 * Creates today's (WIB) capacity row for every active admin/manager/staff. Existing rows are kept.
 * Schedule: 07:15 WIB (= 00:15 UTC) daily.
 *
 * Auth: USER_CAPACITY_CRON_SECRET (falls back to SYNC_INBOX_CRON_SECRET) via
 * `Authorization: Bearer <secret>` or `x-api-key`.
 *
 * Optional backfill: ?from=YYYY-MM-DD&to=YYYY-MM-DD (WIB dates, max 120 days) or ?date=YYYY-MM-DD.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = cronAuthResult(request)
    if (auth === 'missing_secret') {
      return NextResponse.json({ error: 'USER_CAPACITY_CRON_SECRET is not set' }, { status: 503 })
    }
    if (auth === 'bad_key') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const q = request.nextUrl.searchParams
    const date = q.get('date')
    const from = q.get('from') ?? date ?? wibTodayYmd()
    const to = q.get('to') ?? date ?? from
    if (!isValidYmd(from) || !isValidYmd(to) || to < from) {
      return NextResponse.json({ error: 'Invalid date range; use YYYY-MM-DD (WIB).' }, { status: 400 })
    }
    const days = listYmd(from, to)
    if (days.length > MAX_BACKFILL_DAYS) {
      return NextResponse.json({ error: `Range too large (max ${MAX_BACKFILL_DAYS} days).` }, { status: 400 })
    }

    let inserted = 0
    for (const d of days) inserted += await ensureCapacityForDate(d)
    return NextResponse.json({ ok: true, from, to, days: days.length, rows_inserted: inserted })
  } catch (e) {
    console.error('[cron/user-daily-capacity]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
