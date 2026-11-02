import { NextRequest, NextResponse } from 'next/server'

import { sendPicDigests } from '@/lib/pic-digest'

function cronAuthResult(request: NextRequest): 'ok' | 'missing_secret' | 'bad_key' {
  const secret = process.env.PIC_DIGEST_CRON_SECRET ?? process.env.SYNC_INBOX_CRON_SECRET
  if (!secret) return 'missing_secret'
  const authHeader = request.headers.get('authorization')
  const apiKey = request.headers.get('x-api-key')
  const key = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : apiKey
  if (key !== secret) return 'bad_key'
  return 'ok'
}

/**
 * POST /api/cron/pic-daily-digest
 * Emails each PIC the overdue, unassigned and stale tickets of the companies they are in charge of. A PIC with nothing to report gets nothing.
 * Schedule: 08:00 WIB (= 01:00 UTC) on working days.
 *
 * Auth: PIC_DIGEST_CRON_SECRET (falls back to SYNC_INBOX_CRON_SECRET) via `Authorization: Bearer <secret>` or `x-api-key`.
 * Optional: ?stale_days=3 (1 to 60) and ?dry_run=1 (counts per PIC, no email).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = cronAuthResult(request)
    if (auth === 'missing_secret') return NextResponse.json({ error: 'PIC_DIGEST_CRON_SECRET is not set' }, { status: 503 })
    if (auth === 'bad_key') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const q = request.nextUrl.searchParams
    const result = await sendPicDigests({ staleDays: Number(q.get('stale_days')) || undefined, dryRun: q.get('dry_run') === '1' })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron/pic-daily-digest]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
