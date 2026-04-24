import type { NextRequest } from 'next/server'

/**
 * Harus selaras dengan cookie session Auth.js (`getToken` { secureCookie }).
 * Production + akses HTTP (IP:port tanpa TLS) butuh `secureCookie: false`;
 * hanya `NODE_ENV === 'production'` memaksa true dan JWT tidak pernah terbaca.
 */
export function authSecureCookieFromRequest(req: NextRequest): boolean {
  const explicit = process.env.AUTH_COOKIE_SECURE?.toLowerCase()
  if (explicit === 'false' || explicit === '0') return false
  if (explicit === 'true' || explicit === '1') return true

  const base = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '').trim()
  if (base.startsWith('https://')) return true
  if (base.startsWith('http://')) return false

  const forwarded = req.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase()
  if (forwarded === 'http' || forwarded === 'https') {
    return forwarded === 'https'
  }

  const proto = req.nextUrl.protocol.replace(':', '').toLowerCase()
  if (proto === 'http' || proto === 'https') {
    return proto === 'https'
  }

  return process.env.NODE_ENV === 'production'
}
