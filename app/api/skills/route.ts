import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { db, skills } from '@/lib/db'

/** GET /api/skills - skill catalog (admin, manager, staff; never customers). */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const rows = await db.select().from(skills).orderBy(asc(skills.name))
  return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.name, color: r.color ?? '#1677ff' })))
}

/** POST /api/skills { name, color? } - admin/manager. Returns the existing skill when the name already exists. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { name?: string; color?: string }
  const name = String(body.name ?? '').trim().slice(0, 100)
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  try {
    const [row] = await db
      .insert(skills)
      .values({ name, color: body.color || '#1677ff' })
      .onConflictDoNothing({ target: skills.name })
      .returning()
    if (row) return NextResponse.json({ id: row.id, name: row.name, color: row.color ?? '#1677ff' })
    const all = await db.select().from(skills)
    const existing = all.find((s) => s.name.toLowerCase() === name.toLowerCase())
    if (!existing) return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    return NextResponse.json({ id: existing.id, name: existing.name, color: existing.color ?? '#1677ff' })
  } catch (e) {
    console.error('[POST /api/skills] failed:', e)
    return NextResponse.json(
      { error: 'Could not save the skill. Check that migration 075_skills.sql was run and the tables belong to the app database user.' },
      { status: 500 }
    )
  }
}
