import dayjs from 'dayjs'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { buildRecapSnapshotPayload } from '@/lib/recap-snapshot-compute'
import { classifyRecapPeriodForStore } from '@/lib/recap-snapshot-period'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

function parseTeamIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of raw) {
    const id = String(v ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function parseYmd(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

/** POST — compute recap payload (same as save) without writing to DB. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const o = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  const teamIds = parseTeamIds(o?.team_ids)
  const periodStart = parseYmd(o?.period_start)
  const periodEnd = parseYmd(o?.period_end)

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: 'period_start and period_end (YYYY-MM-DD) are required' }, { status: 400 })
  }
  if (teamIds.length === 0) {
    return NextResponse.json({ error: 'team_ids is required' }, { status: 400 })
  }

  if (!classifyRecapPeriodForStore(dayjs(periodStart), dayjs(periodEnd))) {
    return NextResponse.json(
      { error: 'Invalid period: end date must be on or after start date (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  try {
    const built = await buildRecapSnapshotPayload(teamIds, periodStart, periodEnd)
    return NextResponse.json({
      data: {
        period_type: built.period_type,
        payload: built.payload,
        period_start: periodStart,
        period_end: periodEnd,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to build recap preview'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
