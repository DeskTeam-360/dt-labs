import { auth } from '@/auth'
import { canAccessTeams, canAdminTeams } from '@/lib/auth-utils'
import { db } from '@/lib/db'
import { teams, teamMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function sessionRole(session: { user?: { role?: string; id?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** DELETE /api/teams/[id]/members/[memberId] - Remove member (admin or team creator; not the creator user) */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canAccessTeams(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: teamId, memberId } = await params
  if (!teamId || !memberId) {
    return NextResponse.json({ error: 'Team ID and Member ID required' }, { status: 400 })
  }

  const [memberRow] = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
    .limit(1)
  if (!memberRow) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  const [teamRow] = await db
    .select({ createdBy: teams.createdBy })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1)
  if (!teamRow) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const role = sessionRole(session)
  const uid = session.user.id
  if (!canAdminTeams(role) && uid !== teamRow.createdBy) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (memberRow.userId === teamRow.createdBy) {
    return NextResponse.json(
      { error: 'Cannot remove the team creator. Transfer creator to another member first.' },
      { status: 400 }
    )
  }

  const [deleted] = await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.id, memberId)))
    .returning()

  if (!deleted) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
