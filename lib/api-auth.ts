import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { API_KEY_PREFIX, hashApiKey } from '@/lib/api-keys'
import { toWibIso } from '@/lib/api-v1'
import { canManageApiKeys } from '@/lib/auth-utils'
import { apiKeys, apiKeyUsage, db, users } from '@/lib/db'

export type ApiUser = { id: string; role: string }

const HOUR_MS = 3600000
/** Requests whose key was refused for making too many calls, with what the answer should say. */
const RESET_FREES = 10
const rateLimited = new WeakMap<Request, { limit: number; used: number; resetAt: Date; retryAfter: number; free: number }>()

/** The answer for a call that got no user: 429 when the key is over its hourly limit, otherwise 401. */
export function apiUnauthorized(request: Request) {
  const hit = rateLimited.get(request)
  if (!hit) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(
    {
      error: `Rate limit reached: this key may make ${hit.limit} calls per hour and has made ${hit.used} in the last hour. At ${toWibIso(hit.resetAt)} (in about ${Math.max(1, Math.ceil(hit.retryAfter / 60))} minute(s)) ${hit.free} calls will be free again.`,
      limit_per_hour: hit.limit,
      used_last_hour: hit.used,
      reset_at: toWibIso(hit.resetAt),
      retry_after_seconds: hit.retryAfter,
      calls_free_at_reset: hit.free,
    },
    { status: 429, headers: { 'Retry-After': String(hit.retryAfter) } }
  )
}

/** Writes one line of the key's usage log. It never slows down or breaks the call it belongs to. */
function logUsage(keyId: string, request: Request, deniedReason: string | null): void {
  let path = ''
  try {
    path = new URL(request.url).pathname
  } catch {
    // keep empty
  }
  const ip = (request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? '').trim()
  void db
    .insert(apiKeyUsage)
    .values({
      keyId,
      method: request.method.slice(0, 8),
      path: path.slice(0, 200),
      allowed: deniedReason === null,
      deniedReason,
      ip: ip ? ip.slice(0, 64) : null,
      userAgent: (request.headers.get('user-agent') ?? '').slice(0, 200) || null,
    })
    .catch((e) => console.error('[api-key-usage] could not log the call:', e))
}

/**
 * Who is calling: the signed-in session (browser, full access of that person), or an API key
 * (`Authorization: Bearer dtk_...`, made on the API Keys page) that acts as its owner but only for the scopes it was given.
 * Pass the scope the endpoint needs; a key without it gets null (the caller answers 401/403).
 * Every call made with a known key is logged, refused ones with the reason.
 */
export async function getApiUser(request: Request, scope?: string, opts: { log?: boolean } = {}): Promise<ApiUser | null> {
  const log = opts.log !== false
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) {
    if (!bearer.startsWith(API_KEY_PREFIX)) return null
    const [row] = await db
      .select({ id: apiKeys.id, userId: apiKeys.userId, scopes: apiKeys.scopes, rateLimitPerHour: apiKeys.rateLimitPerHour, expiresAt: apiKeys.expiresAt, isActive: apiKeys.isActive })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(bearer)))
      .limit(1)
    if (!row) return null
    const deny = (reason: string) => {
      if (log) logUsage(row.id, request, reason)
      return null
    }
    if (!row.isActive) return deny('switched_off')
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) return deny('expired')
    if (scope && !(row.scopes ?? []).includes(scope)) return deny('missing_scope')
    const [u] = await db.select({ id: users.id, role: users.role, status: users.status }).from(users).where(eq(users.id, row.userId)).limit(1)
    // A key stops working when its owner is switched off or is no longer someone who may keep keys.
    if (!u || (u.status && u.status !== 'active') || !canManageApiKeys(u.role ?? '')) return deny('owner_not_allowed')
    // Calls of the last hour that went through; refused ones do not count against the key.
    if (log) {
      const since = and(eq(apiKeyUsage.keyId, row.id), eq(apiKeyUsage.allowed, true), gt(apiKeyUsage.createdAt, new Date(Date.now() - HOUR_MS)))
      const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(apiKeyUsage).where(since)
      const n = used?.n ?? 0
      if (n >= row.rateLimitPerHour) {
        // The window slides, so calls free up one by one, oldest first. Report when at least RESET_FREES calls are free again.
        const frees = Math.min(n, n - row.rateLimitPerHour + RESET_FREES)
        const [edge] = await db.select({ at: apiKeyUsage.createdAt }).from(apiKeyUsage).where(since).orderBy(asc(apiKeyUsage.createdAt)).offset(frees - 1).limit(1)
        const resetAt = new Date((edge?.at ? new Date(edge.at).getTime() : Date.now()) + HOUR_MS)
        rateLimited.set(request, { limit: row.rateLimitPerHour, used: n, resetAt, retryAfter: Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)), free: Math.min(row.rateLimitPerHour, row.rateLimitPerHour - n + frees) })
        return deny('rate_limited')
      }
      logUsage(row.id, request, null)
    }
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id))
    return { id: u.id, role: (u.role ?? '').toLowerCase() }
  }
  const session = await auth()
  if (!session?.user?.id) return null
  return { id: session.user.id, role: ((session.user as { role?: string }).role ?? '').toLowerCase() }
}

/**
 * The access of the API key in the request, or null when there is no usable key (missing, wrong, switched off or expired).
 * Only reads; it does not log or count the call. The MCP server uses it to offer a key just the tools it may use.
 */
export async function apiKeyScopes(request: Request): Promise<string[] | null> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!bearer || !bearer.startsWith(API_KEY_PREFIX)) return null
  const [row] = await db
    .select({ scopes: apiKeys.scopes, expiresAt: apiKeys.expiresAt, isActive: apiKeys.isActive })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(bearer)))
    .limit(1)
  if (!row || !row.isActive || (row.expiresAt && new Date(row.expiresAt) < new Date())) return null
  return row.scopes ?? []
}

/** Team members only (not customers). */
export function isTeamRole(role: string): boolean {
  return !!role && role !== 'customer'
}
