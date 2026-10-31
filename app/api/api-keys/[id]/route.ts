import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isApiScope } from '@/lib/api-scopes'
import { canManageApiKeys, isAdmin } from '@/lib/auth-utils'
import { apiKeys, db } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

/** The key's owner or an admin; null when not allowed or not found. */
async function ownedKey(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!canManageApiKeys(role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const [row] = await db.select({ id: apiKeys.id, userId: apiKeys.userId }).from(apiKeys).where(eq(apiKeys.id, id)).limit(1)
  if (!row) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (row.userId !== session.user.id && !isAdmin(role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { id: row.id }
}

/** PATCH /api/api-keys/[id] { is_active?, name?, scopes? } - turn a key off or on, rename it, or change what it may do (the key itself stays the same). */
export async function PATCH(request: Request, ctx: Ctx) {
  const k = await ownedKey((await ctx.params).id)
  if (k.error) return k.error
  const body = (await request.json().catch(() => ({}))) as { is_active?: unknown; name?: unknown; scopes?: unknown }
  const set: Partial<typeof apiKeys.$inferInsert> = {}
  if (body.is_active !== undefined) set.isActive = Boolean(body.is_active)
  if (body.name !== undefined) {
    const n = String(body.name).trim().slice(0, 120)
    if (!n) return NextResponse.json({ error: 'Give the key a name' }, { status: 400 })
    set.name = n
  }
  if (body.scopes !== undefined) {
    const scopes = [...new Set((Array.isArray(body.scopes) ? body.scopes : []).filter(isApiScope))]
    if (scopes.length === 0) return NextResponse.json({ error: 'Choose at least one access' }, { status: 400 })
    set.scopes = scopes
  }
  if (Object.keys(set).length === 0) return NextResponse.json({ ok: true })
  await db.update(apiKeys).set(set).where(eq(apiKeys.id, k.id))
  return NextResponse.json({ ok: true })
}

/** DELETE /api/api-keys/[id] - removes the key for good; anything using it stops working. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const k = await ownedKey((await ctx.params).id)
  if (k.error) return k.error
  await db.delete(apiKeys).where(eq(apiKeys.id, k.id))
  return NextResponse.json({ ok: true })
}
