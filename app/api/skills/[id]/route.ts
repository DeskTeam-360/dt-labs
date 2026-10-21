import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { db, skills } from '@/lib/db'

async function guard() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/** PATCH /api/skills/[id] { name?, color? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { name?: string; color?: string }
  const patch: { name?: string; color?: string } = {}
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 100)
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    patch.name = name
  }
  if (body.color !== undefined) patch.color = String(body.color).slice(0, 20)
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  try {
    const [row] = await db.update(skills).set(patch).where(eq(skills.id, id)).returning()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ id: row.id, name: row.name, color: row.color ?? '#1677ff' })
  } catch {
    return NextResponse.json({ error: 'A skill with this name already exists' }, { status: 409 })
  }
}

/** DELETE /api/skills/[id] - removes the skill from users, tickets and company defaults too (cascade). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard()
  if (denied) return denied
  const { id } = await params
  await db.delete(skills).where(eq(skills.id, id))
  return NextResponse.json({ ok: true })
}
