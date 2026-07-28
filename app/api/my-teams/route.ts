import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessMyTeams } from '@/lib/auth-utils'
import { db, teamMembers, teams } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET /api/my-teams — teams visible to the current user based on role:
 *  - Admin: all teams
 *  - Manager: all public teams + private teams they are a member of
 *  - Staff / others: only teams they are a member of
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessMyTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = session.user.id
  const role = (sessionRole(session) ?? '').toLowerCase()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'

  let teamIds: string[]

  if (isAdmin) {
    // Admin sees all teams
    const allTeams = await db.select({ id: teams.id }).from(teams)
    teamIds = allTeams.map((t) => t.id)
  } else if (isManager) {
    // Manager sees all public teams + private teams they belong to
    const memberRows = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
    const memberTeamIds = memberRows.map((r) => r.teamId)

    const visibleTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(
        memberTeamIds.length > 0
          ? or(eq(teams.type, 'public'), inArray(teams.id, memberTeamIds))!
          : eq(teams.type, 'public')
      )
    teamIds = visibleTeams.map((t) => t.id)
  } else {
    // Staff: only teams they are a member of
    const memberRows = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
    teamIds = memberRows.map((r) => r.teamId)
  }

  teamIds = [...new Set(teamIds)]
  if (teamIds.length === 0) {
    return NextResponse.json([])
  }

  const teamRows = await db
    .select({ team: teams })
    .from(teams)
    .where(inArray(teams.id, teamIds))

  const counts = await db
    .select({
      teamId: teamMembers.teamId,
      n: sql<number>`count(*)::int`,
    })
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, teamIds))
    .groupBy(teamMembers.teamId)

  const countByTeam = new Map<string, number>()
  for (const c of counts) {
    countByTeam.set(c.teamId, c.n)
  }

  const result = teamRows.map(({ team }) => ({
    id: team.id,
    name: team.name,
    type: team.type,
    member_count: countByTeam.get(team.id) ?? 0,
  }))

  result.sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json(result)
}
