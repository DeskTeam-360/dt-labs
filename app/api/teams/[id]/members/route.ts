import { auth } from '@/auth'
import { db } from '@/lib/db'
import { teamMembers, users } from '@/lib/db'
import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

const TEAM_INELIGIBLE_ROLES = ['customer', 'guest']

/** GET /api/teams/[id]/members - List team members */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: teamId } = await params
  if (!teamId) {
    return NextResponse.json({ error: 'Team ID required' }, { status: 400 })
  }

  const rows = await db
    .select({
      member: teamMembers,
      user: users,
    })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))

  const result = rows.map((r) => ({
    id: r.member.id,
    team_id: r.member.teamId,
    user_id: r.member.userId,
    role: r.member.role ?? 'member',
    joined_at: r.member.joinedAt ? new Date(r.member.joinedAt).toISOString() : '',
    user_name: r.user?.fullName || r.user?.email || 'Unknown',
    user_email: r.user?.email ?? undefined,
    user_avatar_url: r.user?.avatarUrl ?? null,
  }))

  return NextResponse.json(result)
}

/** POST /api/teams/[id]/members - Add members to team */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: teamId } = await params
  if (!teamId) {
    return NextResponse.json({ error: 'Team ID required' }, { status: 400 })
  }

  const body = await request.json()
  const { user_ids: userIds, role: roleOverride } = body
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: 'user_ids array is required' }, { status: 400 })
  }
  const role = (roleOverride && typeof roleOverride === 'string') ? roleOverride : 'member'

  const userRows = await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, userIds))
  const ineligible = userRows.filter((u) => TEAM_INELIGIBLE_ROLES.includes((u.role ?? '').toLowerCase()))
  if (ineligible.length > 0) {
    return NextResponse.json(
      { error: 'Customer and Guest cannot be added to teams' },
      { status: 400 }
    )
  }

  const existing = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId))
  const existingUserIds = new Set(existing.map((e) => e.userId))
  const newUserIds = userIds.filter((uid: string) => !existingUserIds.has(uid))

  if (newUserIds.length === 0) {
    return NextResponse.json({ error: 'All selected users are already members', added: 0 }, { status: 400 })
  }

  await db.insert(teamMembers).values(
    newUserIds.map((userId: string) => ({
      teamId,
      userId,
      role,
    }))
  )

  const rows = await db
    .select({
      member: teamMembers,
      user: users,
    })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))

  const result = rows.map((r) => ({
    id: r.member.id,
    team_id: r.member.teamId,
    user_id: r.member.userId,
    role: r.member.role ?? 'member',
    joined_at: r.member.joinedAt ? new Date(r.member.joinedAt).toISOString() : '',
    user_name: r.user?.fullName || r.user?.email || 'Unknown',
    user_email: r.user?.email ?? undefined,
    user_avatar_url: r.user?.avatarUrl ?? null,
  }))

  return NextResponse.json({ added: newUserIds.length, members: result })
}
