import { createHash, randomBytes } from 'crypto'
import { eq, sql } from 'drizzle-orm'

import { API_SCOPES } from '@/lib/api-scopes'
import { aiConnectionLimit } from '@/lib/auth-utils'
import { apiKeys, db } from '@/lib/db'

/** A connection lasts this long unless its owner extends it (Profile or Settings, AI connections). */
export const CONNECTION_DAYS = 30
export const ACCESS_TOKEN_SECONDS = CONNECTION_DAYS * 86400
export const CODE_MINUTES = 5

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')
export const sha256Base64Url = (s: string) => createHash('sha256').update(s).digest('base64url')
export const randomToken = (prefix: string, bytes = 32) => `${prefix}${randomBytes(bytes).toString('hex')}`

/** The public address of the app: the configured site URL, else the address the request came in on. */
export function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  if (configured && !configured.includes('localhost')) return configured
  return new URL(request.url).origin
}

/** https, or http on the local machine for development. */
export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.hash) return false
    if (u.protocol === 'https:') return true
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}

export const ALL_SCOPE_KEYS = API_SCOPES.map((s) => s.key)

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
}

/** An OAuth error answer (RFC 6749). */
export const oauthError = (error: string, description: string, status = 400) =>
  new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  })

/** The message when a person is at the number of AI connections their role allows, or null when they may add one. */
export async function connectionLimitMessage(userId: string, role: string | undefined): Promise<string | null> {
  const limit = aiConnectionLimit(role)
  if (limit === null) return null
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(apiKeys).where(eq(apiKeys.userId, userId))
  if ((row?.n ?? 0) < limit) return null
  return `Your role can have ${limit} AI connection${limit === 1 ? '' : 's'} and you already have ${row.n}. Remove the old one first (Profile, AI connections), then connect again.`
}
