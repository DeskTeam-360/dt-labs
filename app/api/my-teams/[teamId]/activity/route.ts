import { auth } from '@/auth'
import { canAccessMyTeams } from '@/lib/auth-utils'
import { accumulateSession, roundHourly, type SessionLike } from '@/lib/my-teams-activity-aggregate'
import { parseMyTeamsActivityDateParam, utcDayBounds, utcTodayYesterday } from '@/lib/my-teams-date'
import { db, teamMembers, ticketTimeTracker, tickets, ticketTypes, users } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { eq, and, inArray, sql, lte, desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET /api/my-teams/[teamId]/activity?date=YYYY-MM-DD&member_id=uuid — UTC calendar day; past range capped in `my-teams-date`. */
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
  const [membership] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, viewerId)))
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { today } = utcTodayYesterday()
  const url = new URL(request.url)
  const date = parseMyTeamsActivityDateParam(url.searchParams.get('date'), today)
  const bounds = utcDayBounds(date)
  if (!bounds) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }
  const { start: dayStart, end: dayEnd } = bounds

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
  const rows = await db
    .select({
      tracker: ticketTimeTracker,
      ticket: tickets,
      ticketType: ticketTypes,
      user: users,
    })
    .from(ticketTimeTracker)
    .leftJoin(tickets, eq(ticketTimeTracker.ticketId, tickets.id))
    .leftJoin(ticketTypes, eq(tickets.typeId, ticketTypes.id))
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

  const teamHourly = Array.from({ length: 24 }, () => 0)
  const memberHourly = new Map<string, number[]>()
  const memberTotals = new Map<string, number>()

  const sessionsPayload: Array<{
    id: string
    user_id: string
    user_name: string
    ticket_id: number
    ticket_title: string | null
    ticket_type_title: string | null
    ticket_type_color: string | null
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
        ticket_type_title: r.ticketType?.title ?? null,
        ticket_type_color: r.ticketType?.color ?? null,
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

  return NextResponse.json({
    date,
    members: membersOut,
    team_hourly_seconds: roundHourly(teamHourly),
    sessions: memberFocus ? sessionsPayload : [],
    member_hourly_seconds: memberHourlyOut,
  })
}
