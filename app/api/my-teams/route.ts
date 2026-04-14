import { auth } from '@/auth'
import { canAccessMyTeams } from '@/lib/auth-utils'
import { db, teams, teamMembers } from '@/lib/db'
import { eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET /api/my-teams — teams the current user is a member of */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessMyTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = session.user.id

  const memberRows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))

  const teamIds = [...new Set(memberRows.map((r) => r.teamId))]
  if (teamIds.length === 0) {
    return NextResponse.json([])
  }

  const teamRows = await db
    .select({
      team: teams,
    })
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
