import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, teamMembers, users } from '@/lib/db'

/** GET /api/tickets/[id]/team-members?team_id=xxx - Get team members for a team */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const teamId = url.searchParams.get('team_id')
  if (!teamId) {
    return NextResponse.json({ error: 'team_id required' }, { status: 400 })
  }

  const rows = await db
    .select({
      id: teamMembers.id,
      teamId: teamMembers.teamId,
      userId: teamMembers.userId,
      user: users,
    })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      user: r.user
        ? { id: r.user.id, full_name: r.user.fullName, email: r.user.email }
        : null,
    }))
  )
}
