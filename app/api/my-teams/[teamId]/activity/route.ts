import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessMyTeams } from '@/lib/auth-utils'
import { db, teamMembers, teams, tickets, ticketTimeTracker, users } from '@/lib/db'
import { loadActiveJobTypeTitleMap } from '@/lib/job-types-db'
import { accumulateSession, roundHourly, type SessionLike } from '@/lib/my-teams-activity-aggregate'
import { localDayBoundsFromYmd, localYmd, validateMyTeamsActivityDayWindow } from '@/lib/my-teams-date'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET /api/my-teams/[teamId]/activity?date=YYYY-MM-DD&day_start=&day_end=&member_id= — local calendar day (client sends ISO bounds); past range capped in `my-teams-date`. */
export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessMyTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { teamId } = await params
  if (!teamId || typeof teamId !== 'string') {
    return NextResponse.json({ error: 'Invalid team' }, { status: 400 })
  }

  const viewerId = session.user.id
  const role = (sessionRole(session) ?? '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'

  if (!isAdmin) {
    const [membership] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, viewerId)))

    if (isManager && !membership) {
      // Manager can access public teams even without membership
      const [teamRow] = await db.select({ type: teams.type }).from(teams).where(eq(teams.id, teamId)).limit(1)
      if (!teamRow || teamRow.type !== 'public') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const url = new URL(request.url)
  const dayStartRaw = url.searchParams.get('day_start')?.trim()
  const dayEndRaw = url.searchParams.get('day_end')?.trim()
  if (!dayStartRaw || !dayEndRaw) {
    return NextResponse.json(
      { error: 'day_start and day_end are required (ISO 8601 local day bounds from the client)' },
      { status: 400 },
    )
  }
  const dayStart = new Date(dayStartRaw)
  const dayEnd = new Date(dayEndRaw)
  if (!validateMyTeamsActivityDayWindow(dayStart, dayEnd)) {
    return NextResponse.json({ error: 'Invalid day window' }, { status: 400 })
  }
  const dateHint = url.searchParams.get('date')?.trim()
  const date = dateHint && /^\d{4}-\d{2}-\d{2}$/.test(dateHint) ? dateHint : localYmd(dayStart)

  const memberFocus = url.searchParams.get('member_id')?.trim() || null

  const membersRows = await db
    .select({
      member: teamMembers,
      user: users,
    })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))

  const memberUserIds = membersRows.map((r) => r.member.userId)
  if (memberUserIds.length === 0) {
    return NextResponse.json({
      date,
      members: [],
      team_hourly_seconds: Array.from({ length: 24 }, () => 0),
      sessions: [],
      member_hourly_seconds: null as number[] | null,
    })
  }

  if (memberFocus && !memberUserIds.includes(memberFocus)) {
    return NextResponse.json({ error: 'Not a team member' }, { status: 400 })
  }

  const now = new Date()
  const jobTypeTitleMap = await loadActiveJobTypeTitleMap()

  const rows = await db
    .select({
      tracker: ticketTimeTracker,
      ticket: tickets,
      user: users,
    })
    .from(ticketTimeTracker)
    .leftJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .leftJoin(users, eq(ticketTimeTracker.userId, users.id))
    .where(
      and(
        inArray(ticketTimeTracker.userId, memberUserIds),
        lte(ticketTimeTracker.startTime, dayEnd),
        sql`coalesce(${ticketTimeTracker.stopTime}, now()) >= ${dayStart.toISOString()}`
      )
    )
    .orderBy(desc(ticketTimeTracker.startTime))
    .limit(800)

  // Build list of calendar dates in the range (local YYYY-MM-DD)
  const rangeDates: string[] = []
  const cursorDate = new Date(dayStart)
  while (cursorDate.getTime() <= dayEnd.getTime()) {
    rangeDates.push(localYmd(cursorDate))
    cursorDate.setDate(cursorDate.getDate() + 1)
  }
  const isMultiDay = rangeDates.length > 1

  const teamHourly = Array.from({ length: 24 }, () => 0)
  const teamDailySeconds = new Map<string, number>(rangeDates.map((d) => [d, 0]))
  // memberDailySeconds: userId -> (date -> seconds)
  const memberDailySeconds = new Map<string, Map<string, number>>()
  const memberHourly = new Map<string, number[]>()
  const memberTotals = new Map<string, number>()

  const sessionsPayload: Array<{
    id: string
    user_id: string
    user_name: string
    ticket_id: number
    ticket_title: string | null
    job_type: string | null
    job_type_title: string | null
    start_time: string
    stop_time: string | null
    reported_duration_seconds: number | null
  }> = []

  for (const r of rows) {
    const t = r.tracker
    const startTime = t.startTime ? new Date(t.startTime) : null
    if (!startTime) continue
    const stopTime = t.stopTime ? new Date(t.stopTime) : null

    const sl: SessionLike = {
      userId: t.userId,
      startTime,
      stopTime,
      durationSeconds: t.durationSeconds,
      durationAdjustment: t.durationAdjustment,
    }
    accumulateSession(teamHourly, memberHourly, memberTotals, sl, dayStart, dayEnd, now)

    // Accumulate per-day totals for multi-day range
    if (isMultiDay) {
      for (const ymd of rangeDates) {
        const dayBounds = localDayBoundsFromYmd(ymd)
        if (!dayBounds) continue
        const rep2 =
          reportedDurationSeconds({ durationSeconds: t.durationSeconds, durationAdjustment: t.durationAdjustment }) ?? 0
        const endWall = t.stopTime ? new Date(t.stopTime) : now
        const wallSec = Math.max(0.001, (endWall.getTime() - startTime.getTime()) / 1000)
        const oStart = Math.max(startTime.getTime(), dayBounds.start.getTime())
        const oEnd = Math.min(endWall.getTime(), dayBounds.end.getTime())
        if (oEnd <= oStart) continue
        const overlapSec = (oEnd - oStart) / 1000
        const attributed = rep2 * (overlapSec / wallSec)
        teamDailySeconds.set(ymd, (teamDailySeconds.get(ymd) ?? 0) + attributed)
        const mds = memberDailySeconds.get(t.userId) ?? new Map<string, number>()
        mds.set(ymd, (mds.get(ymd) ?? 0) + attributed)
        memberDailySeconds.set(t.userId, mds)
      }
    }

    if (memberFocus && t.userId === memberFocus) {
      const rep = reportedDurationSeconds({
        durationSeconds: t.durationSeconds,
        durationAdjustment: t.durationAdjustment,
      })
      sessionsPayload.push({
        id: t.id,
        user_id: t.userId,
        user_name: r.user?.fullName || r.user?.email || 'Unknown',
        ticket_id: t.ticketId,
        ticket_title: r.ticket?.title ?? null,
        job_type: t.jobType ?? null,
        job_type_title: t.jobType ? jobTypeTitleMap.get(t.jobType) ?? t.jobType : null,
        start_time: startTime.toISOString(),
        stop_time: stopTime ? stopTime.toISOString() : null,
        reported_duration_seconds: rep ?? 0,
      })
    }
  }

  const membersOut = membersRows.map((r) => {
    const uid = r.member.userId
    return {
      user_id: uid,
      user_name: r.user?.fullName || r.user?.email || 'Unknown',
      user_email: r.user?.email ?? null,
      avatar_url: r.user?.avatarUrl ?? null,
      department: r.user?.department ?? null,
      position: r.user?.position ?? null,
      reported_seconds: Math.round(memberTotals.get(uid) ?? 0),
    }
  })

  membersOut.sort((a, b) => b.reported_seconds - a.reported_seconds || a.user_name.localeCompare(b.user_name))

  let memberHourlyOut: number[] | null = null
  if (memberFocus) {
    const bins = memberHourly.get(memberFocus) ?? Array.from({ length: 24 }, () => 0)
    memberHourlyOut = roundHourly(bins)
  }

  // Build per-member hourly map for single-day team view (stacked chart)
  const memberHourlyMap: Record<string, number[]> = {}
  if (!isMultiDay && !memberFocus) {
    for (const uid of memberUserIds) {
      const bins = memberHourly.get(uid)
      if (bins) memberHourlyMap[uid] = roundHourly(bins)
    }
  }

  return NextResponse.json({
    date,
    members: membersOut,
    team_hourly_seconds: roundHourly(teamHourly),
    member_hourly_seconds_map: Object.keys(memberHourlyMap).length > 0 ? memberHourlyMap : null,
    team_daily_seconds: isMultiDay
      ? rangeDates.map((d) => {
          const entry: Record<string, unknown> = { date: d }
          for (const uid of memberUserIds) {
            entry[uid] = Math.round(memberDailySeconds.get(uid)?.get(d) ?? 0)
          }
          return entry
        })
      : null,
    daily_member_ids: isMultiDay ? memberUserIds : null,
    sessions: memberFocus ? sessionsPayload : [],
    member_hourly_seconds: memberHourlyOut,
  })
}
