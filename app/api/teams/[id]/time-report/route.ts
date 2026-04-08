import { auth } from '@/auth'
import { canAccessTeams } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { teamMembers, ticketTimeTracker, tickets, users } from '@/lib/db'
import { reportedDurationSeconds } from '@/lib/time-tracker-reported'
import { eq, and, inArray, gte, lte, desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET /api/teams/[id]/time-report?start=ISO&end=ISO&userId=optional - Time tracker for team members */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: teamId } = await params
  const url = new URL(request.url)
  const startParam = url.searchParams.get('start')
  const endParam = url.searchParams.get('end')
  const filterUserId = url.searchParams.get('userId')?.trim() || null

  if (!teamId || !startParam || !endParam) {
    return NextResponse.json({ error: 'team id, start, and end required' }, { status: 400 })
  }

  const startDate = new Date(startParam)
  const endDate = new Date(endParam)

  const membersRows = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId))
  let memberUserIds = membersRows.map((r) => r.userId)
  if (memberUserIds.length === 0) {
    return NextResponse.json([])
  }

  if (filterUserId) {
    if (!memberUserIds.includes(filterUserId)) {
      return NextResponse.json({ error: 'userId is not a member of this team' }, { status: 400 })
    }
    memberUserIds = [filterUserId]
  }

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
        gte(ticketTimeTracker.startTime, startDate),
        lte(ticketTimeTracker.startTime, endDate)
      )
    )
    .orderBy(desc(ticketTimeTracker.startTime))

  const result = rows.map((r) => {
    const rep = reportedDurationSeconds({
      durationSeconds: r.tracker.durationSeconds,
      durationAdjustment: r.tracker.durationAdjustment,
    })
    return {
      id: r.tracker.id,
      user_id: r.tracker.userId,
      user_name: r.user?.fullName || r.user?.email || 'Unknown',
      user_email: r.user?.email ?? undefined,
      ticket_id: r.tracker.ticketId,
      ticket_title: r.ticket?.title,
      start_time: r.tracker.startTime ? new Date(r.tracker.startTime).toISOString() : '',
      stop_time: r.tracker.stopTime ? new Date(r.tracker.stopTime).toISOString() : null,
      duration_seconds: r.tracker.durationSeconds,
      duration_adjustment: r.tracker.durationAdjustment,
      reported_duration_seconds: rep,
    }
  })

  return NextResponse.json(result)
}
