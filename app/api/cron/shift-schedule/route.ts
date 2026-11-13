import { NextRequest, NextResponse } from 'next/server'

import { applyDueShiftSchedules } from '@/lib/shift-schedule'

export const dynamic = 'force-dynamic'

/**
 * POST /api/cron/shift-schedule - optional. Puts people on the shift of the period that is running today.
 * Without it the same thing happens the first time someone opens a screen that reads shifts or users on the period's first day.
 * Schedule: once a day just after midnight WIB (17:05 UTC).
 *
 * Auth: SHIFT_CRON_SECRET (falls back to SYNC_INBOX_CRON_SECRET) via `Authorization: Bearer <secret>` or `x-api-key`.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SHIFT_CRON_SECRET ?? process.env.SYNC_INBOX_CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'SHIFT_CRON_SECRET is not set' }, { status: 503 })
  const header = request.headers.get('authorization')
  const key = header?.startsWith('Bearer ') ? header.slice(7) : request.headers.get('x-api-key')
  if (key !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const moved = await applyDueShiftSchedules()
  return NextResponse.json({ ok: true, people_moved: moved })
}
