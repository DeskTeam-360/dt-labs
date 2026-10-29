import { and, asc, eq, inArray, notInArray, or, type SQL,sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { csv, sqlList } from '@/lib/api-v1'
import { db, shifts, skills,users, userSkills } from '@/lib/db'
import { INACTIVE_USER_STATUSES } from '@/lib/user-status'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 200

/**
 * GET /api/v1/users - find team members (active people only).
 * email (exact, comma list), q (name or email contains), role, skill (name, comma list) with min_level (1-10), limit (max 200).
 * Each person comes with their shift and skills with levels.
 * Auth: browser session or an API key with the `users:read` scope.
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'users:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = new URL(request.url).searchParams
  const conditions: SQL[] = [sql`${users.role} <> 'customer'`, notInArray(users.status, INACTIVE_USER_STATUSES)]

  const emails = csv(q.get('email')).map((e) => e.toLowerCase())
  if (emails.length) conditions.push(sql`lower(${users.email}) IN (${sqlList(emails)})`)
  const text = (q.get('q') ?? '').trim()
  if (text) {
    const pattern = `%${text.replace(/[%_\\]/g, '\\$&')}%`
    conditions.push(or(sql`${users.fullName} ILIKE ${pattern}`, sql`${users.email} ILIKE ${pattern}`)!)
  }
  const roles = csv(q.get('role')).map((r) => r.toLowerCase())
  if (roles.length) conditions.push(inArray(users.role, roles))

  const skillNames = csv(q.get('skill')).map((s) => s.toLowerCase())
  const minLevel = Math.min(10, Math.max(1, Math.round(Number(q.get('min_level'))) || 1))
  if (skillNames.length) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = ${users.id} AND lower(s.name) IN (${sqlList(skillNames)}) AND us.level >= ${minLevel})`
    )
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.get('limit')) || 100))
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      status: users.status,
      shiftTitle: shifts.title,
      shiftStart: shifts.startTime,
      shiftEnd: shifts.endTime,
    })
    .from(users)
    .leftJoin(shifts, eq(users.shiftId, shifts.id))
    .where(and(...conditions))
    .orderBy(asc(users.fullName))
    .limit(limit)

  const ids = rows.map((r) => r.id)
  const skillRows = ids.length
    ? await db
        .select({ userId: userSkills.userId, name: skills.name, level: userSkills.level })
        .from(userSkills)
        .innerJoin(skills, eq(userSkills.skillId, skills.id))
        .where(inArray(userSkills.userId, ids))
    : []
  const skillsBy = new Map<string, { name: string; level: number }[]>()
  for (const s of skillRows) skillsBy.set(s.userId, [...(skillsBy.get(s.userId) ?? []), { name: s.name, level: s.level }])

  return NextResponse.json({
    total: rows.length,
    users: rows.map((r) => ({
      id: r.id,
      full_name: r.fullName,
      email: r.email,
      role: r.role,
      status: r.status,
      shift: r.shiftTitle ? { title: r.shiftTitle, start: String(r.shiftStart).slice(0, 5), end: String(r.shiftEnd).slice(0, 5), timezone: 'WIB' } : null,
      skills: (skillsBy.get(r.id) ?? []).sort((a, b) => b.level - a.level),
    })),
  })
}
