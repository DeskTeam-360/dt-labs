import { type NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * Jangan import `auth` dari `@/auth` di sini — itu menarik Drizzle + postgres + bcrypt ke Edge
 * (timeout Vercel / memori besar). Cukup decode JWT sesi dengan getToken (ringan).
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
    secureCookie: process.env.NODE_ENV === 'production',
  })

  const accessRevoked = token?.error === 'AccessRevoked'
  const isLoggedIn = !!token && !accessRevoked && !!(token as { id?: string }).id

  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  if (req.nextUrl.pathname === '/login' && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

/** Hanya halaman yang butuh redirect auth — mengurangi invokasi middleware di Vercel. */
export const config = {
  matcher: ['/login', '/dashboard/:path*'],
}
