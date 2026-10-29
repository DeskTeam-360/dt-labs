import { desc, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { generateApiKey } from '@/lib/api-keys'
import { isApiScope } from '@/lib/api-scopes'
import { canManageApiKeys, isAdmin } from '@/lib/auth-utils'
import { apiKeys, apiKeyUsage, db, users } from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAX_KEYS_PER_USER = 20

async function gate() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!canManageApiKeys(role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id, role }
}

/** GET /api/api-keys -> your own keys (an admin also sees everyone's). The key itself is never returned again. */
export async function GET() {
  const g = await gate()
  if (g.error) return g.error
  const rows = await db
    .select({ k: apiKeys, ownerName: users.fullName, ownerEmail: users.email })
    .from(apiKeys)
    .leftJoin(users, eq(apiKeys.userId, users.id))
    .where(isAdmin(g.role) ? undefined : eq(apiKeys.userId, g.userId))
    .orderBy(desc(apiKeys.createdAt))
  const recent = await db
    .select({ keyId: apiKeyUsage.keyId, n: sql<number>`count(*)::int` })
    .from(apiKeyUsage)
    .where(gte(apiKeyUsage.createdAt, new Date(Date.now() - 86400000)))
    .groupBy(apiKeyUsage.keyId)
  const calls24h = new Map(recent.map((r) => [r.keyId, r.n]))
  return NextResponse.json({
    keys: rows.map((r) => ({
      calls_24h: calls24h.get(r.k.id) ?? 0,
      id: r.k.id,
      name: r.k.name,
      key_prefix: r.k.keyPrefix,
      scopes: r.k.scopes,
      expires_at: r.k.expiresAt ? new Date(r.k.expiresAt).toISOString() : null,
      is_active: r.k.isActive,
      last_used_at: r.k.lastUsedAt ? new Date(r.k.lastUsedAt).toISOString() : null,
      created_at: r.k.createdAt ? new Date(r.k.createdAt).toISOString() : null,
      owner: r.ownerName || r.ownerEmail || null,
      mine: r.k.userId === g.userId,
    })),
  })
}

/** POST /api/api-keys { name, scopes, expires_in_days } -> { key } shown once. */
export async function POST(request: Request) {
  const g = await gate()
  if (g.error) return g.error
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; scopes?: unknown; expires_in_days?: unknown }
  const name = String(body.name ?? '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: 'Give the key a name' }, { status: 400 })
  const scopes = [...new Set((Array.isArray(body.scopes) ? body.scopes : []).filter(isApiScope))]
  if (scopes.length === 0) return NextResponse.json({ error: 'Choose at least one access' }, { status: 400 })
  const days = Number(body.expires_in_days)
  const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + Math.min(365, Math.round(days)) * 86400000) : null
  // A key never lives forever: no expiry is not offered, the longest is a year.
  if (!expiresAt) return NextResponse.json({ error: 'Choose when the key expires (1 to 365 days)' }, { status: 400 })

  const mine = await db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.userId, g.userId))
  if (mine.length >= MAX_KEYS_PER_USER) return NextResponse.json({ error: `You can have up to ${MAX_KEYS_PER_USER} keys; delete one you no longer use` }, { status: 400 })

  const { key, prefix, hash } = generateApiKey()
  const [row] = await db.insert(apiKeys).values({ userId: g.userId, name, keyPrefix: prefix, keyHash: hash, scopes, expiresAt }).returning({ id: apiKeys.id })
  return NextResponse.json({ id: row.id, key, expires_at: expiresAt.toISOString() }, { status: 201 })
}
