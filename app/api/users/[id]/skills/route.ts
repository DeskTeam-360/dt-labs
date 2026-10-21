import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getUserSkillLevels, setUserSkills, validSkillIds } from '@/lib/skills'

/** GET /api/users/[id]/skills -> { skills: [{ skill_id, level }] } (staff). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ skills: await getUserSkillLevels((await params).id) })
}

/** PUT /api/users/[id]/skills { skills: [{ skill_id, level (1-10) }] } - replaces the list (admin only). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (((session.user as { role?: string }).role ?? '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { skills?: { skill_id?: unknown; level?: unknown }[] }
  const input = Array.isArray(body.skills) ? body.skills : []
  const valid = new Set(await validSkillIds(input.map((s) => s.skill_id)))
  const items = input
    .filter((s) => valid.has(String(s.skill_id)))
    .map((s) => ({ skillId: String(s.skill_id), level: s.level }))
  const userId = (await params).id
  await setUserSkills(userId, items)
  return NextResponse.json({ skills: await getUserSkillLevels(userId) })
}
