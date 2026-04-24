import type { NextRequest } from 'next/server'

/**
 * Harus selaras dengan nama cookie JWT Auth.js (`getToken` { secureCookie }).
 *
 * Auth.js memilih `useSecureCookies` dari **URL request** (`url.protocol === "https:"`),
 * bukan dari `AUTH_URL` saja (@auth/core init). Kalau di VPS Anda buka `http://IP:3003`
 * tapi `.env` masih `AUTH_URL=https://...` (salinan Vercel), membaca `AUTH_URL` dulu
 * memaksa `secureCookie: true` padahal cookie sesi bernama `authjs.session-token`
 * (tanpa prefiks `__Secure-`) → selalu dianggap belum login.
 *
 * Urutan: override eksplisit → protokol dari request (proxy / URL) → barulah `AUTH_URL`
 * jika tidak bisa diturunkan dari request → fallback production.
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
