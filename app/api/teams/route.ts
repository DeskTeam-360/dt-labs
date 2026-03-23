import { auth } from '@/auth'
import { db } from '@/lib/db'
import { teams, users, teamMembers } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/teams - List all teams with creator and member count */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const teamsRows = await db
    .select({
      team: teams,
      creator: users,
    })
    .from(teams)
    .leftJoin(users, eq(teams.createdBy, users.id))
    .orderBy(desc(teams.createdAt))

  const teamIds = teamsRows.map((r) => r.team.id)
  const membersByTeam: Record<string, Array<{ id: string; team_id: string; user_id: string; role: string; joined_at: string; user_name?: string; user_email?: string; user_avatar_url?: string | null }>> = {}

  if (teamIds.length > 0) {
    const { inArray } = await import('drizzle-orm')
    const allMembersRows = await db
      .select({
        member: teamMembers,
        user: users,
      })
      .from(teamMembers)
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .where(inArray(teamMembers.teamId, teamIds))

    for (const row of allMembersRows) {
      const tid = row.member.teamId
      if (!membersByTeam[tid]) membersByTeam[tid] = []
      membersByTeam[tid].push({
        id: row.member.id,
        team_id: row.member.teamId,
        user_id: row.member.userId,
        role: row.member.role ?? 'member',
        joined_at: row.member.joinedAt ? new Date(row.member.joinedAt).toISOString() : '',
        user_name: row.user?.fullName || row.user?.email || 'Unknown',
        user_email: row.user?.email ?? undefined,
        user_avatar_url: row.user?.avatarUrl ?? null,
      })
    }
  }

  const result = teamsRows.map((r) => {
    const t = r.team
    const members = membersByTeam[t.id] || []
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      created_by: t.createdBy,
      created_at: t.createdAt ? new Date(t.createdAt).toISOString() : '',
      creator_name: r.creator?.fullName || r.creator?.email || 'Unknown',
      member_count: members.length,
      members,
    }
  })

  return NextResponse.json(result)
}

/** POST /api/teams - Create a new team */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, type } = body
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const [inserted] = await db
    .insert(teams)
    .values({
      name: name.trim(),
      type: type && typeof type === 'string' ? type.trim() || null : null,
      createdBy: session.user.id,
    })
    .returning()

  if (!inserted) {
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }

  // Add creator as team member (manager role)
  await db.insert(teamMembers).values({
    teamId: inserted.id,
    userId: session.user.id,
    role: 'manager',
  })

  return NextResponse.json({
    id: inserted.id,
    name: inserted.name,
    type: inserted.type,
    created_by: inserted.createdBy,
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    creator_name: session.user.name || session.user.email || 'Unknown',
    member_count: 1,
    members: [{
      user_id: session.user.id,
      role: 'manager',
      joined_at: new Date().toISOString(),
      user_name: session.user.name || session.user.email || 'Unknown',
      user_email: session.user.email ?? undefined,
      user_avatar_url: session.user.image ?? null,
    }],
  })
}
