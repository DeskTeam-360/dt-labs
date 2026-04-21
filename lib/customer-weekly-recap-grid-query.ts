import dayjs from 'dayjs'
import { and, eq, inArray } from 'drizzle-orm'

import { companies, customerWeeklyRecapCells, db } from '@/lib/db'

export type WeeklyRecapGridCellDto = {
  is_embedded: boolean
  client_time_hours: number
  tracker_reported_seconds: number
  utilization_percent: number | null
}

export type WeeklyRecapGridRowDto = {
  company_id: string
  company_name: string
  any_embedded: boolean
  cells: Record<string, WeeklyRecapGridCellDto>
}

function utilizationPercent(clientHours: number, trackerSeconds: number): number | null {
  const denom = (Number(clientHours) || 0) * 3600
  if (denom <= 0) return null
  return Math.round((trackerSeconds / denom) * 10000) / 100
}

function weekKeyFromDb(v: unknown): string {
  if (v instanceof Date) return dayjs(v).format('YYYY-MM-DD')
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

/** Pivot rows for one team and a fixed list of week_start keys (YYYY-MM-DD). */
export async function fetchWeeklyRecapRowsForTeam(
  teamId: string,
  weekKeys: string[]
): Promise<WeeklyRecapGridRowDto[]> {
  if (weekKeys.length === 0) return []

  const cells = await db
    .select({
      companyId: customerWeeklyRecapCells.companyId,
      weekStart: customerWeeklyRecapCells.weekStart,
      isEmbedded: customerWeeklyRecapCells.isEmbedded,
      clientTimeHours: customerWeeklyRecapCells.clientTimeHours,
      trackerReportedSeconds: customerWeeklyRecapCells.trackerReportedSeconds,
    })
    .from(customerWeeklyRecapCells)
    .where(and(eq(customerWeeklyRecapCells.teamId, teamId), inArray(customerWeeklyRecapCells.weekStart, weekKeys)))

  const companyIds = [...new Set(cells.map((c) => c.companyId))]
  const namesById = new Map<string, string>()
  if (companyIds.length > 0) {
    const crows = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(inArray(companies.id, companyIds))
    for (const c of crows) {
      namesById.set(c.id, c.name ?? c.id)
    }
  }

  const byCompany = new Map<string, Record<string, WeeklyRecapGridCellDto>>()
  for (const c of cells) {
    const wk = weekKeyFromDb(c.weekStart)
    const ch = Number(c.clientTimeHours) || 0
    const ts = Number(c.trackerReportedSeconds) || 0
    const util = utilizationPercent(ch, ts)
    if (!byCompany.has(c.companyId)) byCompany.set(c.companyId, {})
    byCompany.get(c.companyId)![wk] = {
      is_embedded: Boolean(c.isEmbedded),
      client_time_hours: ch,
      tracker_reported_seconds: ts,
      utilization_percent: util,
    }
  }

  const rows = [...byCompany.entries()].map(([company_id, cellsByWeek]) => {
    const anyEmbedded = weekKeys.some((wk) => cellsByWeek[wk]?.is_embedded)
    return {
      company_id,
      company_name: namesById.get(company_id) ?? company_id,
      any_embedded: anyEmbedded,
      cells: cellsByWeek,
    }
  })

  rows.sort((a, b) => {
    if (a.any_embedded !== b.any_embedded) return a.any_embedded ? -1 : 1
    return (a.company_name || '').localeCompare(b.company_name || '', undefined, { sensitivity: 'base' })
  })

  return rows
}
