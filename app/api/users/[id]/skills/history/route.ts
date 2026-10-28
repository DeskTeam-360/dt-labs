import { desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, skills, users,userSkillHistory } from '@/lib/db'

/** GET /api/users/[id]/skills/history -> { history: [...] } newest first (staff). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actor = alias(users, 'actor')
  const rows = await db
    .select({
      id: userSkillHistory.id,
      skill_id: userSkillHistory.skillId,
      skill_name: skills.name,
      old_level: userSkillHistory.oldLevel,
      new_level: userSkillHistory.newLevel,
      changed_at: userSkillHistory.changedAt,
      changed_by_name: actor.fullName,
      changed_by_email: actor.email,
    })
    .from(userSkillHistory)
    .leftJoin(skills, eq(userSkillHistory.skillId, skills.id))
    .leftJoin(actor, eq(userSkillHistory.changedBy, actor.id))
    .where(eq(userSkillHistory.userId, (await params).id))
    .orderBy(desc(userSkillHistory.changedAt))
    .limit(200)

  return NextResponse.json({
    history: rows.map((r) => ({
      ...r,
      changed_at: r.changed_at ? new Date(r.changed_at).toISOString() : null,
      changed_by: r.changed_by_name || r.changed_by_email || null,
    })),
  })
}
