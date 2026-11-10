import { and, eq, gt, lt } from 'drizzle-orm'

import { generateApiKey } from '@/lib/api-keys'
import { callsPerHourForRole, effectiveScopes } from '@/lib/api-scopes'
import { apiKeys, db, oauthClients, oauthCodes, oauthGrants, users } from '@/lib/db'
import { ACCESS_TOKEN_SECONDS, connectionLimitMessage, CORS_HEADERS, oauthError, randomToken, sha256Base64Url, sha256Hex } from '@/lib/oauth'

export const dynamic = 'force-dynamic'

const tokenResponse = (accessToken: string, refreshToken: string, scopes: string[], expiresIn: number = ACCESS_TOKEN_SECONDS) =>
  Response.json(
    { access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn, refresh_token: refreshToken, scope: scopes.join(' ') },
    { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', ...CORS_HEADERS } }
  )

/**
 * POST /api/oauth/token (form-encoded) - swaps an authorization code (with its PKCE verifier) or a refresh token for an access token.
 * The access token is an API key (dtk_...) that lives for an hour; the refresh token renews the same key, so changes made to the key
 * in Settings (access, limit, switched off) keep applying. Switching the key off or deleting it ends the connection.
 */
export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text())
  const grant = form.get('grant_type')
  const clientId = form.get('client_id') ?? ''
  const [client] = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1).catch(() => [])
  if (!client) return oauthError('invalid_client', 'Unknown client_id', 401)

  const accessExpires = () => new Date(Date.now() + ACCESS_TOKEN_SECONDS * 1000)

  if (grant === 'authorization_code') {
    const code = form.get('code') ?? ''
    const verifier = form.get('code_verifier') ?? ''
    // Single use: the row is removed as it is read, so a replayed code finds nothing.
    const [row] = await db.delete(oauthCodes).where(and(eq(oauthCodes.codeHash, sha256Hex(code)), gt(oauthCodes.expiresAt, new Date()))).returning()
    if (!row || row.clientId !== client.id || row.redirectUri !== (form.get('redirect_uri') ?? '')) return oauthError('invalid_grant', 'The code is wrong, used or expired')
    if (!verifier || sha256Base64Url(verifier) !== row.codeChallenge) return oauthError('invalid_grant', 'PKCE check failed')
    const [owner] = await db.select({ role: users.role }).from(users).where(eq(users.id, row.userId)).limit(1)
    const limited = await connectionLimitMessage(row.userId, owner?.role ?? undefined)
    if (limited) return oauthError('access_denied', limited, 403)

    const { key, prefix, hash } = generateApiKey()
    const refresh = randomToken('dtr_', 32)
    // The connection lasts CONNECTION_DAYS from now; renewing the token never moves this date, only the owner's Extend does.
    const expiry = accessExpires()
    const [keyRow] = await db
      .insert(apiKeys)
      .values({ userId: row.userId, name: `${client.name} (OAuth)`, keyPrefix: prefix, keyHash: hash, scopes: effectiveScopes(row.scopes, owner?.role), rateLimitPerHour: callsPerHourForRole(owner?.role), expiresAt: expiry })
      .returning({ id: apiKeys.id })
    await db.insert(oauthGrants).values({ clientId: client.id, userId: row.userId, keyId: keyRow.id, refreshHash: sha256Hex(refresh), refreshExpiresAt: expiry })
    return tokenResponse(key, refresh, effectiveScopes(row.scopes, owner?.role))
  }

  if (grant === 'refresh_token') {
    const presented = form.get('refresh_token') ?? ''
    const [g] = await db
      .select({ id: oauthGrants.id, clientId: oauthGrants.clientId, keyId: oauthGrants.keyId, refreshExpiresAt: oauthGrants.refreshExpiresAt })
      .from(oauthGrants)
      .where(eq(oauthGrants.refreshHash, sha256Hex(presented)))
      .limit(1)
    if (!g || g.clientId !== client.id || g.refreshExpiresAt < new Date()) return oauthError('invalid_grant', 'The refresh token is wrong or expired')
    const [keyRow] = await db.select({ isActive: apiKeys.isActive, scopes: apiKeys.scopes }).from(apiKeys).where(eq(apiKeys.id, g.keyId)).limit(1)
    if (!keyRow || !keyRow.isActive) return oauthError('invalid_grant', 'This connection was switched off')

    const { key, prefix, hash } = generateApiKey()
    const refresh = randomToken('dtr_', 32)
    // A new token for the same connection: it ends when the connection does (never later than CONNECTION_DAYS from now, for older connections).
    const expiry = new Date(Math.min(g.refreshExpiresAt.getTime(), accessExpires().getTime()))
    await db.update(apiKeys).set({ keyHash: hash, keyPrefix: prefix, expiresAt: expiry }).where(eq(apiKeys.id, g.keyId))
    await db.update(oauthGrants).set({ refreshHash: sha256Hex(refresh) }).where(eq(oauthGrants.id, g.id))
    return tokenResponse(key, refresh, keyRow.scopes ?? [], Math.max(60, Math.floor((expiry.getTime() - Date.now()) / 1000)))
  }

  // Old unused codes are cleaned up now and then.
  void db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date())).catch(() => undefined)
  return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token')
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
