import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessTeamPool } from '@/lib/auth-utils'
import { db, teamMembers, teams } from '@/lib/db'

/**
 * GET /api/board/team-members
 * Every team with the ids of its members. Feeds the "Quick select" of the Team Pool (pick a whole team in one click).
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessTeamPool((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [teamRows, memberRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(asc(teams.name)),
    db.select({ teamId: teamMembers.teamId, userId: teamMembers.userId }).from(teamMembers).innerJoin(teams, eq(teamMembers.teamId, teams.id)),
  ])
  const byTeam = new Map<string, string[]>()
  for (const m of memberRows) byTeam.set(m.teamId, [...(byTeam.get(m.teamId) ?? []), m.userId])
  return NextResponse.json({ teams: teamRows.map((t) => ({ id: t.id, name: t.name, user_ids: byTeam.get(t.id) ?? [] })) })
}
