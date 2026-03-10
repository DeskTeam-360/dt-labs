import { auth } from '@/auth'
import { db } from '@/lib/db'
import { teamMembers } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** DELETE /api/teams/[id]/members/[memberId] - Remove member from team */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: teamId, memberId } = await params
  if (!teamId || !memberId) {
    return NextResponse.json({ error: 'Team ID and Member ID required' }, { status: 400 })
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
