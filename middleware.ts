import { type NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

import { authSecureCookieFromRequest } from '@/lib/auth-secure-cookies'

/**
 * Do not import `auth` from `@/auth` here — that pulls Drizzle + postgres + bcrypt into Edge
 * (Vercel timeouts / large memory). Just decode the session JWT with getToken (lightweight).
 */
export async function middleware(req: NextRequest) {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    console.error('[middleware] AUTH_SECRET is not set')
    return NextResponse.next()
  }

  const token = await getToken({
    req,
    secret,
    secureCookie: authSecureCookieFromRequest(req),
  })

  const accessRevoked = token?.error === 'AccessRevoked'
  const isLoggedIn = !!token && !accessRevoked && !!(token as { id?: string }).id
  const mustChangePassword = !!token?.mustChangePassword

  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  if (req.nextUrl.pathname === '/login' && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  if (isLoggedIn && mustChangePassword && req.nextUrl.pathname !== '/change-password' && req.nextUrl.pathname !== '/forgot-password') {
    return NextResponse.redirect(new URL('/change-password', req.url))
  }

  return NextResponse.next()
}

/** Only pages that need auth redirects — reduces middleware invocations on Vercel. */
export const config = {
  matcher: ['/login', '/dashboard/:path*', '/tickets/:path*', '/settings/:path*', '/change-password'],
}
