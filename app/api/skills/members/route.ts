import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { db, userSkills } from '@/lib/db'

/** GET /api/skills/members -> { [skillId]: [{ user_id, level }] } - who has which skill (admin, manager). */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const rows = await db.select({ skillId: userSkills.skillId, userId: userSkills.userId, level: userSkills.level }).from(userSkills)
  const out: Record<string, { user_id: string; level: number }[]> = {}
  for (const r of rows) (out[r.skillId] ??= []).push({ user_id: r.userId, level: r.level })
  return NextResponse.json(out)
}
