import { createHash, randomBytes } from 'crypto'

import { API_SCOPES } from '@/lib/api-scopes'

export const ACCESS_TOKEN_SECONDS = 3600
export const REFRESH_TOKEN_DAYS = 90
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
