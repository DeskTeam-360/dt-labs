import { desc, eq, gte, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { allowedScopesForRole, callsPerHourForRole } from '@/lib/api-scopes'
import { canManageApiKeys, isAdmin } from '@/lib/auth-utils'
import { apiKeys, apiKeyUsage, db, oauthGrants, users } from '@/lib/db'

export const dynamic = 'force-dynamic'


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
    .select({ k: apiKeys, ownerName: users.fullName, ownerEmail: users.email, ownerRole: users.role })
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
  const viaOauth = new Set((await db.select({ keyId: oauthGrants.keyId }).from(oauthGrants)).map((g) => g.keyId))
  return NextResponse.json({
    keys: rows.map((r) => ({
      calls_24h: calls24h.get(r.k.id) ?? 0,
      connection: viaOauth.has(r.k.id) ? 'oauth' : 'manual',
      id: r.k.id,
      name: r.k.name,
      key_prefix: r.k.keyPrefix,
      scopes: r.k.scopes,
      expires_at: r.k.expiresAt ? new Date(r.k.expiresAt).toISOString() : null,
      is_active: r.k.isActive,
      rate_limit_per_hour: Math.min(r.k.rateLimitPerHour, callsPerHourForRole(r.ownerRole)),
      max_calls_per_hour: callsPerHourForRole(r.ownerRole),
      owner_role: r.ownerRole,
      allowed_scopes: allowedScopesForRole(r.ownerRole),
      last_used_at: r.k.lastUsedAt ? new Date(r.k.lastUsedAt).toISOString() : null,
      created_at: r.k.createdAt ? new Date(r.k.createdAt).toISOString() : null,
      owner: r.ownerName || r.ownerEmail || null,
      mine: r.k.userId === g.userId,
    })),
  })
}

/** POST /api/api-keys - keys are no longer made by hand: an assistant connects through MCP and OAuth (see /api/oauth/token). */
export async function POST() {
  return NextResponse.json({ error: 'API keys are no longer made by hand. Connect the assistant through MCP: add the server address in its connectors and approve the access.' }, { status: 410 })
}
