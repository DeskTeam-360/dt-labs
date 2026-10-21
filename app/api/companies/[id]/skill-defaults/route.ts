import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { companyTypeSkills, db } from '@/lib/db'
import { cleanPrimary, getDefaultSkillSet, validSkillIds } from '@/lib/skills'

/**
 * GET /api/companies/[id]/skill-defaults -> { defaults: { [type_id]: { skill_ids, primary_skill_id } } } (staff)
 * GET ...?type_id=N -> { skill_ids, primary_skill_id } for just that type.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const companyId = (await params).id
  const typeParam = new URL(request.url).searchParams.get('type_id')
  if (typeParam) {
    return NextResponse.json(await getDefaultSkillSet(companyId, Number(typeParam)))
  }
  const rows = await db.select().from(companyTypeSkills).where(eq(companyTypeSkills.companyId, companyId))
  const defaults: Record<string, { skill_ids: string[]; primary_skill_id: string | null }> = {}
  for (const r of rows) {
    const d = (defaults[String(r.typeId)] ??= { skill_ids: [], primary_skill_id: null })
    d.skill_ids.push(r.skillId)
    if (r.isPrimary) d.primary_skill_id = r.skillId
  }
  return NextResponse.json({ defaults })
}

/** PUT /api/companies/[id]/skill-defaults { type_id, skill_ids, primary_skill_id? } - replaces the defaults of one ticket type (admin/manager). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const companyId = (await params).id
  const body = (await request.json().catch(() => ({}))) as { type_id?: unknown; skill_ids?: unknown; primary_skill_id?: unknown }
  const typeId = Number(body.type_id)
  if (!Number.isInteger(typeId)) return NextResponse.json({ error: 'type_id required' }, { status: 400 })
  const ids = await validSkillIds(body.skill_ids)
  const primary = cleanPrimary(ids, body.primary_skill_id)
  await db.transaction(async (tx) => {
    await tx
      .delete(companyTypeSkills)
      .where(and(eq(companyTypeSkills.companyId, companyId), eq(companyTypeSkills.typeId, typeId)))
    if (ids.length) await tx.insert(companyTypeSkills).values(ids.map((skillId) => ({ companyId, typeId, skillId, isPrimary: skillId === primary })))
  })
  return NextResponse.json({ type_id: typeId, skill_ids: ids, primary_skill_id: primary })
}
