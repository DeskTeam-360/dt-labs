import dayjs from 'dayjs'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import {
  listTeamIdsFromDb,
  materializeCustomerWeeklyRecapForTeam,
} from '@/lib/customer-weekly-recap-materialize'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

function parseYmd(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

/** POST — rebuild weekly cells for one team and range (aligned to ISO weeks). Admin/manager. */
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
  const teamIdRaw = typeof o?.team_id === 'string' ? o.team_id.trim() : ''
  const from = parseYmd(o?.from ?? o?.period_start)
  const to = parseYmd(o?.to ?? o?.period_end)
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
  }
  const start = dayjs(from).startOf('day')
  const end = dayjs(to).endOf('day')
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  try {
    if (teamIdRaw) {
      const result = await materializeCustomerWeeklyRecapForTeam({
        teamId: teamIdRaw,
        rangeStart: start,
        rangeEnd: end,
      })
      return NextResponse.json({
        ok: true,
        teams_processed: 1,
        weeksProcessed: result.weeksProcessed,
        cellsWritten: result.cellsWritten,
        results: [{ teamId: teamIdRaw, ...result }],
      })
    }

    const teamIds = await listTeamIdsFromDb()
    let weeksProcessed = 0
    let cellsWritten = 0
    const results: { teamId: string; weeksProcessed: number; cellsWritten: number }[] = []
    for (const tid of teamIds) {
      const r = await materializeCustomerWeeklyRecapForTeam({ teamId: tid, rangeStart: start, rangeEnd: end })
      weeksProcessed += r.weeksProcessed
      cellsWritten += r.cellsWritten
      results.push({ teamId: tid, ...r })
    }
    return NextResponse.json({
      ok: true,
      teams_processed: teamIds.length,
      weeksProcessed,
      cellsWritten,
      results,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Materialize failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
