import type { NextRequest } from 'next/server'

/**
 * Must match JWT Auth.js cookie name (`getToken` { secureCookie }).
 *
 * Auth.js derives `useSecureCookies` from the **request URL** (`url.protocol === "https:"`),
 * not just from `AUTH_URL` alone (@auth/core init). If you open `http://IP:3003`
 * on your VPS but `.env` still has `AUTH_URL=https://...` (Vercel copy), reading `AUTH_URL` first
 * forces `secureCookie: true` but the session cookie is named `authjs.session-token`
 * (without `__Secure-` prefix) → always treated as not logged in.
 *
 * Order: explicit override → protocol from request (proxy / URL) → then `AUTH_URL`
 * if not derivable from request → fallback to production.
 */
export function authSecureCookieFromRequest(req: NextRequest): boolean {
  const explicit = process.env.AUTH_COOKIE_SECURE?.toLowerCase()
  if (explicit === 'false' || explicit === '0') return false
  if (explicit === 'true' || explicit === '1') return true

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

  const base = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '').trim()
  if (base.startsWith('https://')) return true
  if (base.startsWith('http://')) return false

  return process.env.NODE_ENV === 'production'
}
