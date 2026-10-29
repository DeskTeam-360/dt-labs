import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isInternalUser } from '@/lib/auth-utils'
import { db, googleCalendarConnections } from '@/lib/db'
import { googleOAuthClient } from '@/lib/google-calendar'

const BASE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

function back(code: string) {
  const res = NextResponse.redirect(new URL(`/calendar?google=${code}`, BASE()))
  res.cookies.delete('gcal_oauth_nonce')
  return res
}

/** GET /api/calendar/google/callback - Google sends the person back here with a code. */
export async function GET(request: NextRequest) {
  try {
    const q = new URL(request.url).searchParams
    if (q.get('error')) return back(q.get('error') === 'access_denied' ? 'denied' : 'error')
    const code = q.get('code')
    if (!code) return back('error')

    const session = await auth()
    if (!session?.user?.id || !isInternalUser((session.user as { role?: string }).role)) return back('forbidden')

    let state: { userId?: string; nonce?: string } = {}
    try {
      state = JSON.parse(Buffer.from(q.get('state') ?? '', 'base64url').toString())
    } catch {
      return back('error')
    }
    if (state.userId !== session.user.id || !state.nonce || state.nonce !== request.cookies.get('gcal_oauth_nonce')?.value) return back('error')

    const client = googleOAuthClient()
    const { tokens } = await client.getToken(code)
    if (!tokens.access_token) return back('error')
    const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    const email = info.ok ? (((await info.json()) as { email?: string }).email ?? null) : null

    const values = {
      googleEmail: email,
      accessToken: tokens.access_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      updatedAt: new Date(),
    }
    // Google only returns a refresh token on the first consent; the old one is kept when it is missing.
    const withRefresh = tokens.refresh_token ? { ...values, refreshToken: tokens.refresh_token } : values
    await db
      .insert(googleCalendarConnections)
      .values({ userId: session.user.id, ...withRefresh })
      .onConflictDoUpdate({ target: googleCalendarConnections.userId, set: withRefresh })
    return back('connected')
  } catch (e) {
    console.error('[google-calendar] callback failed:', e)
    return back('error')
  }
}
