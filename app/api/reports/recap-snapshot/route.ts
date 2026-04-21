import dayjs from 'dayjs'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { db, recapSnapshots } from '@/lib/db'
import { buildRecapSnapshotPayload } from '@/lib/recap-snapshot-compute'
import { classifyRecapPeriod } from '@/lib/recap-snapshot-period'

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

/** GET — whether a recap row already exists for the same title + period + teams (for Save vs Update label). */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const title = (url.searchParams.get('title') ?? '').trim()
  const periodStart = parseYmd(url.searchParams.get('period_start'))
  const periodEnd = parseYmd(url.searchParams.get('period_end'))
  const teamIds = parseTeamIds(
    url.searchParams
      .get('team_ids')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? []
  )

  if (!title || !periodStart || !periodEnd || teamIds.length === 0) {
    return NextResponse.json({ id: null })
  }

  const teamKey = [...teamIds].sort().join(',')

  const [row] = await db
    .select({ id: recapSnapshots.id })
    .from(recapSnapshots)
    .where(
      and(
        eq(recapSnapshots.teamKey, teamKey),
        eq(recapSnapshots.periodStart, periodStart),
        eq(recapSnapshots.periodEnd, periodEnd),
        eq(recapSnapshots.title, title)
      )
    )
    .limit(1)

  return NextResponse.json({ id: row?.id ?? null })
}

/** POST — upsert recap snapshot (full month or full ISO week only). */
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
  const title = String(o?.title ?? '').trim()
  const teamIds = parseTeamIds(o?.team_ids)
  const periodStart = parseYmd(o?.period_start)
  const periodEnd = parseYmd(o?.period_end)

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: 'period_start and period_end (YYYY-MM-DD) are required' }, { status: 400 })
  }
  if (teamIds.length === 0) {
    return NextResponse.json({ error: 'team_ids is required' }, { status: 400 })
  }

  if (!classifyRecapPeriod(dayjs(periodStart), dayjs(periodEnd))) {
    return NextResponse.json(
      { error: 'Date range must be a full calendar month or a full ISO week (Mon–Sun)' },
      { status: 400 }
    )
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 })
  }

  let period_type: 'month' | 'week'
  let payload: Record<string, unknown>
  try {
    const built = await buildRecapSnapshotPayload(teamIds, periodStart, periodEnd)
    period_type = built.period_type
    payload = built.payload
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to build recap'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const teamKey = [...teamIds].sort().join(',')

  const [existing] = await db
    .select({ id: recapSnapshots.id })
    .from(recapSnapshots)
    .where(
      and(
        eq(recapSnapshots.teamKey, teamKey),
        eq(recapSnapshots.periodStart, periodStart),
        eq(recapSnapshots.periodEnd, periodEnd),
        eq(recapSnapshots.title, title)
      )
    )
    .limit(1)

  if (existing) {
    await db
      .update(recapSnapshots)
      .set({
        payload,
        teamIds,
        periodType: period_type,
        updatedAt: new Date(),
        createdBy: userId,
      })
      .where(eq(recapSnapshots.id, existing.id))

    return NextResponse.json({ id: existing.id, updated: true })
  }

  const [inserted] = await db
    .insert(recapSnapshots)
    .values({
      title,
      periodStart,
      periodEnd,
      periodType: period_type,
      teamIds,
      teamKey,
      payload,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning()

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ id: inserted.id, updated: false })
}
