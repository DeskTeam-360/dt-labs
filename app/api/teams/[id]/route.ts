import { auth } from '@/auth'
import { db } from '@/lib/db'
import { teams, users, teamMembers } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PATCH /api/teams/[id] - Update team */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Team ID required' }, { status: 400 })
  }

  const body = await request.json()
  const { name, type } = body

  const values: Record<string, unknown> = {}
  if (name !== undefined) values.name = typeof name === 'string' ? name.trim() : null
  if (type !== undefined) values.type = type && typeof type === 'string' ? type.trim() || null : null

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(teams)
    .set(values)
    .where(eq(teams.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  const [creator] = await db.select().from(users).where(eq(users.id, updated.createdBy)).limit(1)
  const members = await db
    .select({
      member: teamMembers,
      user: users,
    })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, id))

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    type: updated.type,
    created_by: updated.createdBy,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    creator_name: creator?.fullName || creator?.email || 'Unknown',
    member_count: members.length,
    members: members.map((r) => ({
      id: r.member.id,
      team_id: r.member.teamId,
      user_id: r.member.userId,
      role: r.member.role ?? 'member',
      joined_at: r.member.joinedAt ? new Date(r.member.joinedAt).toISOString() : '',
      user_name: r.user?.fullName || r.user?.email || 'Unknown',
      user_email: r.user?.email ?? undefined,
      user_avatar_url: r.user?.avatarUrl ?? null,
    })),
  })
}

/** DELETE /api/teams/[id] - Delete team and its members */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Team ID required' }, { status: 400 })
  }

  await db.delete(teamMembers).where(eq(teamMembers.teamId, id))
  const [deleted] = await db.delete(teams).where(eq(teams.id, id)).returning()

  if (!deleted) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
