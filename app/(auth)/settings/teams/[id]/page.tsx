import { auth } from '@/auth'
import { db, teams, users, teamMembers } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import TeamDetailContent from '@/components/TeamDetailContent'

export default async function SettingsTeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params

  const [teamRow] = await db
    .select({ team: teams, creator: users })
    .from(teams)
    .leftJoin(users, eq(teams.createdBy, users.id))
    .where(eq(teams.id, id))
    .limit(1)

  if (!teamRow) redirect('/settings/teams')

  const membersRows = await db
    .select({ member: teamMembers, user: users })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, id))
    .orderBy(asc(teamMembers.joinedAt))

  const members = membersRows.map((m) => ({
    id: m.member.id,
    team_id: m.member.teamId,
    user_id: m.member.userId,
    role: m.member.role ?? 'member',
    joined_at: m.member.joinedAt.toISOString(),
    user_name: m.user?.fullName || m.user?.email || 'Unknown',
    user_email: m.user?.email || '',
    user_avatar_url: m.user?.avatarUrl || null,
  }))

  const team = {
    id: teamRow.team.id,
    name: teamRow.team.name,
    type: teamRow.team.type,
    created_by: teamRow.team.createdBy,
    created_at: teamRow.team.createdAt.toISOString(),
    creator_name: teamRow.creator?.fullName || teamRow.creator?.email || 'Unknown',
    members,
  }

  return <TeamDetailContent user={session.user} team={team} />
}
