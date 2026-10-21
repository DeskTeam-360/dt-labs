import { and, eq, gte } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, userSkills } from '@/lib/db'

/** GET /api/skills/people?skill_id=...&min_level=7 -> { user_ids } of people with that skill at that level or higher (staff). */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(request.url)
  const skillId = url.searchParams.get('skill_id')
  if (!skillId) return NextResponse.json({ error: 'skill_id required' }, { status: 400 })
  const min = Math.min(10, Math.max(1, Math.round(Number(url.searchParams.get('min_level')) || 1)))
  const rows = await db
    .select({ userId: userSkills.userId })
    .from(userSkills)
    .where(and(eq(userSkills.skillId, skillId), gte(userSkills.level, min)))
  return NextResponse.json({ user_ids: rows.map((r) => r.userId) })
}
