import { eq } from 'drizzle-orm'

import { auth } from '@/auth'
import { API_KEY_PREFIX, hashApiKey } from '@/lib/api-keys'
import { canManageApiKeys } from '@/lib/auth-utils'
import { apiKeys, apiKeyUsage, db, users } from '@/lib/db'

export type ApiUser = { id: string; role: string }

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
      .select({ id: apiKeys.id, userId: apiKeys.userId, scopes: apiKeys.scopes, expiresAt: apiKeys.expiresAt, isActive: apiKeys.isActive })
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
    if (log) logUsage(row.id, request, null)
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id))
    return { id: u.id, role: (u.role ?? '').toLowerCase() }
  }
  const session = await auth()
  if (!session?.user?.id) return null
  return { id: session.user.id, role: ((session.user as { role?: string }).role ?? '').toLowerCase() }
}

/** Team members only (not customers). */
export function isTeamRole(role: string): boolean {
  return !!role && role !== 'customer'
}
