import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canManageApiKeys, isAdmin } from '@/lib/auth-utils'
import { apiKeys, apiKeyUsage, db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const KEEP_DAYS = 90

/** GET /api/api-keys/[id]/usage - what a key was used for: counts, per endpoint, per day and the latest calls. Owner or admin. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!canManageApiKeys(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  const [key] = await db.select({ id: apiKeys.id, userId: apiKeys.userId, name: apiKeys.name }).from(apiKeys).where(eq(apiKeys.id, id)).limit(1)
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (key.userId !== session.user.id && !isAdmin(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // The log keeps 90 days; older lines go whenever someone looks at the usage.
  await db.delete(apiKeyUsage).where(lt(apiKeyUsage.createdAt, new Date(Date.now() - KEEP_DAYS * 86400000)))

  const now = Date.now()
  const day = new Date(now - 86400000)
  const week = new Date(now - 7 * 86400000)
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      last24h: sql<number>`count(*) FILTER (WHERE ${apiKeyUsage.createdAt} >= ${day.toISOString()})::int`,
      last7d: sql<number>`count(*) FILTER (WHERE ${apiKeyUsage.createdAt} >= ${week.toISOString()})::int`,
      denied: sql<number>`count(*) FILTER (WHERE NOT ${apiKeyUsage.allowed})::int`,
    })
    .from(apiKeyUsage)
    .where(eq(apiKeyUsage.keyId, id))

  const [byEndpoint, byDay, recent] = await Promise.all([
    db
      .select({
        method: apiKeyUsage.method,
        path: apiKeyUsage.path,
        calls: sql<number>`count(*)::int`,
        denied: sql<number>`count(*) FILTER (WHERE NOT ${apiKeyUsage.allowed})::int`,
        lastAt: sql<string>`max(${apiKeyUsage.createdAt})`,
      })
      .from(apiKeyUsage)
      .where(eq(apiKeyUsage.keyId, id))
      .groupBy(apiKeyUsage.method, apiKeyUsage.path)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ d: sql<string>`to_char(${apiKeyUsage.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`, calls: sql<number>`count(*)::int` })
      .from(apiKeyUsage)
      .where(and(eq(apiKeyUsage.keyId, id), gte(apiKeyUsage.createdAt, new Date(now - 14 * 86400000))))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select()
      .from(apiKeyUsage)
      .where(eq(apiKeyUsage.keyId, id))
      .orderBy(desc(apiKeyUsage.createdAt))
      .limit(50),
  ])

  return NextResponse.json({
    key: { id: key.id, name: key.name },
    keep_days: KEEP_DAYS,
    summary: { total: totals?.total ?? 0, last_24h: totals?.last24h ?? 0, last_7d: totals?.last7d ?? 0, refused: totals?.denied ?? 0 },
    by_endpoint: byEndpoint.map((r) => ({ method: r.method, path: r.path, calls: r.calls, refused: r.denied, last_at: new Date(r.lastAt).toISOString() })),
    by_day: byDay.map((r) => ({ date: r.d, calls: r.calls })),
    recent: recent.map((r) => ({
      at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
      method: r.method,
      path: r.path,
      allowed: r.allowed,
      reason: r.deniedReason,
      ip: r.ip,
      user_agent: r.userAgent,
    })),
  })
}
