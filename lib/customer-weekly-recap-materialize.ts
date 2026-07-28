import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'

import {
  companyDailyActiveAssignments,
  customerWeeklyRecapCells,
  db,
  teamMembers,
  teams,
  tickets,
  ticketTimeTracker,
} from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

dayjs.extend(isoWeek)

export type IsoWeekBlock = {
  weekStart: Dayjs
  weekEnd: Dayjs
  isoYear: number
  isoWeek: number
}

/** ISO weeks (Mon–Sun) that overlap [start, end] inclusive. */
export function listIsoWeeksOverlapping(start: Dayjs, end: Dayjs): IsoWeekBlock[] {
  const s = start.startOf('day')
  const e = end.endOf('day')
  const byKey = new Map<string, IsoWeekBlock>()
  let ws = s.startOf('isoWeek').startOf('day')
  let guard = 0
  while ((ws.isBefore(e) || ws.isSame(e, 'day')) && guard < 120) {
    guard += 1
    const we = ws.endOf('isoWeek').endOf('day')
    const key = ws.format('YYYY-MM-DD')
    if (!byKey.has(key)) {
      byKey.set(key, {
        weekStart: ws,
        weekEnd: we,
        isoYear: ws.isoWeekYear(),
        isoWeek: ws.isoWeek(),
      })
    }
    ws = ws.add(1, 'week').startOf('day')
  }
  return [...byKey.values()].sort((a, b) => a.weekStart.valueOf() - b.weekStart.valueOf())
}

function weekBoundsUtc(wsYmd: string, weYmd: string): { start: Date; end: Date } {
  return {
    start: new Date(`${wsYmd}T00:00:00.000Z`),
    end: new Date(`${weYmd}T23:59:59.999Z`),
  }
}

/**
 * Upserts `customer_weekly_recap_cells` for one team and a date range (aligned to ISO weeks).
 */
export async function materializeCustomerWeeklyRecapForTeam(opts: {
  teamId: string
  rangeStart: Dayjs
  rangeEnd: Dayjs
}): Promise<{ weeksProcessed: number; cellsWritten: number }> {
  const { teamId, rangeStart, rangeEnd } = opts
  const weeks = listIsoWeeksOverlapping(rangeStart, rangeEnd)
  if (weeks.length === 0) {
    return { weeksProcessed: 0, cellsWritten: 0 }
  }

  let cellsWritten = 0

  // Fetch team members once for the entire range
  const memberRows = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId))
  const memberUserIds = memberRows.map((r) => r.userId)

  for (const w of weeks) {
    const wsYmd = w.weekStart.format('YYYY-MM-DD')
    const weYmd = w.weekEnd.format('YYYY-MM-DD')
    const { start: weekStartDt, end: weekEndDt } = weekBoundsUtc(wsYmd, weYmd)

    const dailyRows = await db
      .select()
      .from(companyDailyActiveAssignments)
      .where(
        and(
          eq(companyDailyActiveAssignments.activeTeamId, teamId),
          gte(companyDailyActiveAssignments.snapshotDate, wsYmd),
          lte(companyDailyActiveAssignments.snapshotDate, weYmd)
        )
      )

    const clientByCompany = new Map<string, number>()
    for (const r of dailyRows) {
      const cid = r.companyId
      const h = Number(r.activeTime) || 0
      clientByCompany.set(cid, (clientByCompany.get(cid) ?? 0) + h)
    }

    const companyUniverse = new Set<string>(clientByCompany.keys())

    const trackerRows =
      memberUserIds.length === 0
        ? []
        : await db
            .select({
              companyId: tickets.companyId,
              durationSeconds: ticketTimeTracker.durationSeconds,
              durationAdjustment: ticketTimeTracker.durationAdjustment,
              startTime: ticketTimeTracker.startTime,
              stopTime: ticketTimeTracker.stopTime,
            })
            .from(ticketTimeTracker)
            .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
            .where(
              and(
                isNotNull(ticketTimeTracker.stopTime),
                isNotNull(tickets.companyId),
                eq(tickets.ticketType, 'support'),
                inArray(ticketTimeTracker.userId, memberUserIds),
                lte(ticketTimeTracker.startTime, weekEndDt),
                sql`coalesce(${ticketTimeTracker.stopTime}, now()) >= ${weekStartDt.toISOString()}`
              )
            )

    const trackerByCompany = new Map<string, number>()
    for (const row of trackerRows) {
      const cid = row.companyId
      if (!cid) continue
      const sec = reportedDurationSeconds({
        durationSeconds: row.durationSeconds,
        durationAdjustment: row.durationAdjustment,
      })
      if (sec <= 0) continue
      trackerByCompany.set(cid, (trackerByCompany.get(cid) ?? 0) + sec)
      // Only count tracker time for companies assigned to THIS team (via active_team_id).
      // Adding foreign companies here caused the same company to appear under every team
      // whose members happened to log time on it.
    }

    // Delete all existing cells for this team+week before re-inserting so stale
    // companies (from previous runs that incorrectly added tracker-only companies)
    // are fully removed rather than left untouched by the upsert.
    await db
      .delete(customerWeeklyRecapCells)
      .where(
        and(
          eq(customerWeeklyRecapCells.teamId, teamId),
          eq(customerWeeklyRecapCells.weekStart, wsYmd)
        )
      )

    const batch: (typeof customerWeeklyRecapCells.$inferInsert)[] = []
    const now = new Date()

    for (const companyId of companyUniverse) {
      const clientHours = clientByCompany.get(companyId) ?? 0
      const trackerSeconds = trackerByCompany.get(companyId) ?? 0
      const embeddedFromDaily = dailyRows.some((r) => r.companyId === companyId)
      batch.push({
        teamId,
        companyId,
        weekStart: wsYmd,
        weekEnd: weYmd,
        isoYear: w.isoYear,
        isoWeek: w.isoWeek,
        isEmbedded: embeddedFromDaily,
        clientTimeHours: clientHours,
        trackerReportedSeconds: trackerSeconds,
        computedAt: now,
      })
    }

    const chunkSize = 80
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize)
      if (chunk.length === 0) continue
      await db.insert(customerWeeklyRecapCells).values(chunk)
      cellsWritten += chunk.length
    }
  }

  return { weeksProcessed: weeks.length, cellsWritten }
}

/** Materialize last N ISO weeks for each team id (admin/cron). */
export async function materializeCustomerWeeklyRecapForTeams(
  teamIds: string[],
  weeksBack: number
): Promise<{ teamId: string; weeksProcessed: number; cellsWritten: number }[]> {
  const end = dayjs().endOf('day')
  const start = end.subtract(Math.max(1, Math.min(104, weeksBack)), 'week').startOf('isoWeek').startOf('day')
  const out: { teamId: string; weeksProcessed: number; cellsWritten: number }[] = []
  for (const teamId of teamIds) {
    const r = await materializeCustomerWeeklyRecapForTeam({ teamId, rangeStart: start, rangeEnd: end })
    out.push({ teamId, ...r })
  }
  return out
}

export async function listTeamIdsFromDb(): Promise<string[]> {
  const trows = await db.select({ id: teams.id }).from(teams)
  return trows.map((r) => r.id)
}
