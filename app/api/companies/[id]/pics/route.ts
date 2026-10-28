import { eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { companyPics, db, users } from '@/lib/db'

/** GET /api/companies/[id]/pics -> { pics: [{ user_id, full_name, email, role }] } primary first (staff). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const companyId = (await params).id
  const rows = await db
    .select({ user_id: companyPics.userId, role: companyPics.role, full_name: users.fullName, email: users.email })
    .from(companyPics)
    .innerJoin(users, eq(companyPics.userId, users.id))
    .where(eq(companyPics.companyId, companyId))
  rows.sort((a, b) => (a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1) || (a.full_name || a.email).localeCompare(b.full_name || b.email))
  return NextResponse.json({ pics: rows })
}

/** PUT /api/companies/[id]/pics { pics: [{ user_id, role: 'primary' | 'secondary' }] } - replaces the list (admin or manager). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminOrManager((session.user as { role?: string }).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const companyId = (await params).id
  const body = (await request.json().catch(() => ({}))) as { pics?: { user_id?: unknown; role?: unknown }[] }
  const input = Array.isArray(body.pics) ? body.pics : []

  const wanted = new Map<string, 'primary' | 'secondary'>()
  for (const p of input) {
    const id = String(p.user_id ?? '')
    if (id) wanted.set(id, p.role === 'primary' ? 'primary' : 'secondary')
  }
  if ([...wanted.values()].filter((r) => r === 'primary').length > 1) {
    return NextResponse.json({ error: 'Only one PIC can be primary' }, { status: 400 })
  }
  const ids = [...wanted.keys()]
  const found = ids.length ? await db.select({ id: users.id }).from(users).where(inArray(users.id, ids)) : []
  const valid = new Set(found.map((u) => u.id))

  await db.transaction(async (tx) => {
    await tx.delete(companyPics).where(eq(companyPics.companyId, companyId))
    const values = [...wanted].filter(([id]) => valid.has(id)).map(([userId, role]) => ({ companyId, userId, role }))
    if (values.length) await tx.insert(companyPics).values(values)
  })
  return NextResponse.json({ ok: true })
}
