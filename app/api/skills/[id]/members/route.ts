import { and, eq, inArray, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { db, skills, users,userSkills } from '@/lib/db'

async function guard() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

/**
 * POST /api/skills/[id]/members { user_ids, level? } - admin only.
 * Gives this skill to these people at one level (1-10, default 5). People who already have it are left as they are.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const skillId = (await params).id
  const body = (await request.json().catch(() => ({}))) as { user_ids?: unknown; level?: unknown }
  const ids = [...new Set((Array.isArray(body.user_ids) ? body.user_ids : []).map((v) => String(v)))]
  if (ids.length === 0) return NextResponse.json({ error: 'Pick at least one person' }, { status: 400 })
  const lvl = Math.round(Number(body.level))
  const level = Number.isFinite(lvl) ? Math.min(10, Math.max(1, lvl)) : 5

  const [skill] = await db.select({ id: skills.id }).from(skills).where(eq(skills.id, skillId)).limit(1)
  if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const staff = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), ne(users.role, 'customer')))
  if (staff.length === 0) return NextResponse.json({ added: 0 })
  const added = await db
    .insert(userSkills)
    .values(staff.map((u) => ({ userId: u.id, skillId, level })))
    .onConflictDoNothing()
    .returning({ userId: userSkills.userId })
  return NextResponse.json({ added: added.length, skipped: staff.length - added.length })
}

/** DELETE /api/skills/[id]/members?user_id=... - takes this skill away from one person (admin only). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const userId = new URL(request.url).searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  await db.delete(userSkills).where(and(eq(userSkills.skillId, (await params).id), eq(userSkills.userId, userId)))
  return NextResponse.json({ ok: true })
}
