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

  // "View as" a client is read only: while an admin or manager is looking as a client, nothing may be changed.
  // (Signing in and out and the session itself, under /api/auth, stay open so they can leave.)
  const path = req.nextUrl.pathname
  if (path.startsWith('/api/')) {
    const viewingAs = !!(token as { impersonatorId?: string } | null)?.impersonatorId
    if (viewingAs && !path.startsWith('/api/auth/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return NextResponse.json({ error: 'You are viewing as another user (read only). Exit that view to make changes.' }, { status: 403 })
    }
    return NextResponse.next()
  }

  const accessRevoked = token?.error === 'AccessRevoked'
  const isLoggedIn = !!token && !accessRevoked && !!(token as { id?: string }).id
  const mustChangePassword = !!token?.mustChangePassword

  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  if (req.nextUrl.pathname === '/login' && isLoggedIn) {
    const next = req.nextUrl.searchParams.get('next')
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null
    return NextResponse.redirect(new URL(safeNext ?? '/dashboard', req.url))
  }

  if (isLoggedIn && mustChangePassword && req.nextUrl.pathname !== '/change-password' && req.nextUrl.pathname !== '/forgot-password') {
    return NextResponse.redirect(new URL('/change-password', req.url))
  }

  return NextResponse.next()
}

/** Pages that need auth redirects, and the API (only to keep "view as" read only). */
export const config = {
  matcher: ['/login', '/dashboard/:path*', '/tickets/:path*', '/settings/:path*', '/change-password', '/api/:path*'],
}
