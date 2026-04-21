import dayjs from 'dayjs'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { fetchWeeklyRecapRowsForTeam } from '@/lib/customer-weekly-recap-grid-query'
import { listIsoWeeksOverlapping } from '@/lib/customer-weekly-recap-materialize'
import { weekColumnHeaderMonthW } from '@/lib/customer-weekly-recap-week-label'
import { db, teams } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

function parseYmd(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

/**
 * GET — weekly recap grid(s).
 * Query: from, to (YYYY-MM-DD, optional default last ~12 ISO weeks).
 * Optional team_id: if set, only that team; if omitted, all teams (each with its own rows).
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const teamIdFilter = (url.searchParams.get('team_id') ?? '').trim()

  const defaultTo = dayjs()
  const defaultFrom = defaultTo.subtract(12, 'week').startOf('isoWeek')
  const from = parseYmd(url.searchParams.get('from')) ?? defaultFrom.format('YYYY-MM-DD')
  const to = parseYmd(url.searchParams.get('to')) ?? defaultTo.format('YYYY-MM-DD')
  const start = dayjs(from).startOf('day')
  const end = dayjs(to).endOf('day')
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
    return NextResponse.json({ error: 'Invalid from/to' }, { status: 400 })
  }

  const weekBlocks = listIsoWeeksOverlapping(start, end)
  const weekKeys = weekBlocks.map((w) => w.weekStart.format('YYYY-MM-DD'))

  const weeks = weekBlocks.map((w) => ({
    week_start: w.weekStart.format('YYYY-MM-DD'),
    week_end: w.weekEnd.format('YYYY-MM-DD'),
    iso_year: w.isoYear,
    iso_week: w.isoWeek,
    header: weekColumnHeaderMonthW(w.weekStart),
    label: `${w.weekStart.format('MMM D')} – ${w.weekEnd.format('MMM D, YYYY')}`,
  }))

  let teamList = await db.select({ id: teams.id, name: teams.name }).from(teams)
  if (teamIdFilter) {
    teamList = teamList.filter((t) => t.id === teamIdFilter)
    if (teamList.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
  }
  teamList.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))

  const team_grids = []
  for (const t of teamList) {
    const rows = await fetchWeeklyRecapRowsForTeam(t.id, weekKeys)
    team_grids.push({
      team: { id: t.id, name: t.name ?? t.id },
      rows,
    })
  }

  /** Legacy single-team shape when team_id was passed (keeps older clients working). */
  if (teamIdFilter && team_grids.length === 1) {
    const only = team_grids[0]!
    return NextResponse.json({
      team: only.team,
      weeks,
      rows: only.rows,
      team_grids,
    })
  }

  return NextResponse.json({
    weeks,
    team_grids,
  })
}
