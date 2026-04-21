import dayjs from 'dayjs'
import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'

import {
  companyDailyActiveAssignments,
  db,
  teamMembers,
  teams,
  tickets,
  ticketTimeTracker,
  users,
} from '@/lib/db'
import { classifyRecapPeriod } from '@/lib/recap-snapshot-period'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

const HOURS_PER_MEMBER_PER_DAY = 8

function normalizePosition(p: string | null | undefined): string | null {
  if (!p?.trim()) return null
  return p.trim()
}

export async function buildRecapSnapshotPayload(
  teamIds: string[],
  periodStartYmd: string,
  periodEndYmd: string
): Promise<{ period_type: 'month' | 'week'; payload: Record<string, unknown> }> {
  const periodType = classifyRecapPeriod(dayjs(periodStartYmd), dayjs(periodEndYmd))
  if (!periodType) {
    throw new Error('Period must be a full calendar month or a full ISO week (Mon–Sun)')
  }

  const startDate = new Date(`${periodStartYmd}T00:00:00.000Z`)
  const endDate = new Date(`${periodEndYmd}T23:59:59.999Z`)

  const logRows = await db
    .select()
    .from(companyDailyActiveAssignments)
    .where(
      and(
        isNotNull(companyDailyActiveAssignments.activeTeamId),
        inArray(companyDailyActiveAssignments.activeTeamId, teamIds),
        gte(companyDailyActiveAssignments.snapshotDate, periodStartYmd),
        lte(companyDailyActiveAssignments.snapshotDate, periodEndYmd)
      )
    )

  const companySet = new Set<string>()
  let totalClientTimeHours = 0
  for (const r of logRows) {
    companySet.add(r.companyId)
    totalClientTimeHours += Number(r.activeTime) || 0
  }
  const totalClient = companySet.size
  const logRowCount = logRows.length
  const avgLogRowsPerCompany = logRowCount / Math.max(1, totalClient)

  const companyIds = [...companySet]

  const memberRows = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, teamIds))

  const teamMemberUserIds = new Set(memberRows.map((m) => m.userId))

  const teamMemberCountByPosition = new Map<string, number>()
  if (teamMemberUserIds.size > 0) {
    const userRows = await db
      .select({ id: users.id, position: users.position })
      .from(users)
      .where(inArray(users.id, [...teamMemberUserIds]))
    for (const u of userRows) {
      const key = normalizePosition(u.position)
      if (!key) continue
      teamMemberCountByPosition.set(key, (teamMemberCountByPosition.get(key) ?? 0) + 1)
    }
  }

  const teamNameRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(inArray(teams.id, teamIds))
  const teamNames = teamIds.map((id) => teamNameRows.find((t) => t.id === id)?.name ?? id)

  const trackerRows =
    companyIds.length > 0
      ? await db
          .select({
            tracker: ticketTimeTracker,
            userId: ticketTimeTracker.userId,
            position: users.position,
          })
          .from(ticketTimeTracker)
          .innerJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
          .innerJoin(users, eq(ticketTimeTracker.userId, users.id))
          .where(
            and(
              isNotNull(ticketTimeTracker.stopTime),
              inArray(tickets.companyId, companyIds),
              eq(tickets.ticketType, 'support'),
              lte(ticketTimeTracker.startTime, endDate),
              sql`coalesce(${ticketTimeTracker.stopTime}, now()) >= ${startDate.toISOString()}`
            )
          )
      : []

  const timeUsedByPosition = new Map<string, number>()
  let notInTeamSeconds = 0

  for (const row of trackerRows) {
    const sec = reportedDurationSeconds({
      durationSeconds: row.tracker.durationSeconds,
      durationAdjustment: row.tracker.durationAdjustment,
    })
    const pos = normalizePosition(row.position)
    if (teamMemberUserIds.has(row.userId) && pos) {
      timeUsedByPosition.set(pos, (timeUsedByPosition.get(pos) ?? 0) + sec)
    } else {
      notInTeamSeconds += sec
    }
  }

  type RoleBlock = {
    position: string
    time_used_seconds: number
    team_members_with_role: number
    time_available_seconds: number
    time_left_over_seconds: number
    pct_used: number | null
  }

  const seenPos = new Set<string>()
  for (const pos of timeUsedByPosition.keys()) seenPos.add(pos)
  for (const pos of teamMemberCountByPosition.keys()) seenPos.add(pos)

  const roles: RoleBlock[] = []
  let totalTimeUsedSeconds = notInTeamSeconds
  let totalTimeAvailableSeconds = 0

  for (const pos of [...seenPos].sort((a, b) => a.localeCompare(b))) {
    const used = timeUsedByPosition.get(pos) ?? 0
    const teamCnt = teamMemberCountByPosition.get(pos) ?? 0
    const availHours = teamCnt * HOURS_PER_MEMBER_PER_DAY * avgLogRowsPerCompany
    const availSec = Math.round(availHours * 3600)
    totalTimeUsedSeconds += used
    totalTimeAvailableSeconds += availSec
    const left = availSec - used
    const pct = availSec > 0 ? Math.round((used / availSec) * 10000) / 100 : null
    roles.push({
      position: pos,
      time_used_seconds: used,
      team_members_with_role: teamCnt,
      time_available_seconds: availSec,
      time_left_over_seconds: left,
      pct_used: pct,
    })
  }

  if (notInTeamSeconds > 0) {
    roles.push({
      position: 'Not in team',
      time_used_seconds: notInTeamSeconds,
      team_members_with_role: 0,
      time_available_seconds: 0,
      time_left_over_seconds: -notInTeamSeconds,
      pct_used: null,
    })
  }

  const totalClientTimeSeconds = totalClientTimeHours * 3600
  const leftOverTimeSeconds = totalClientTimeSeconds - totalTimeUsedSeconds
  const leftOverPerDay =
    avgLogRowsPerCompany > 0 ? leftOverTimeSeconds / avgLogRowsPerCompany : 0
  const availableTasks = leftOverPerDay / 4

  const roleTasks = roles
    .filter((r) => r.team_members_with_role > 0)
    .map((r) => ({
      position: r.position,
      available_tasks:
        avgLogRowsPerCompany > 0 ? r.time_left_over_seconds / avgLogRowsPerCompany / 4 : 0,
    }))

  const payload: Record<string, unknown> = {
    formula_version: 1,
    team_ids: teamIds,
    team_names: teamNames,
    total_team: teamIds.length,
    total_client: totalClient,
    total_client_time_hours: totalClientTimeHours,
    company_log: {
      row_count: logRowCount,
      distinct_companies: totalClient,
      avg_rows_per_company: Math.round(avgLogRowsPerCompany * 1000) / 1000,
    },
    by_position: roles,
    totals: {
      total_time_used_seconds: totalTimeUsedSeconds,
      total_time_available_seconds: totalTimeAvailableSeconds,
      total_time_left_over_seconds: totalTimeAvailableSeconds - totalTimeUsedSeconds,
    },
    left_over_time_seconds: leftOverTimeSeconds,
    left_over_per_day_seconds: leftOverPerDay,
    available_tasks: availableTasks,
    available_tasks_by_role: roleTasks,
    period: { start: periodStartYmd, end: periodEndYmd },
  }

  return { period_type: periodType, payload }
}
