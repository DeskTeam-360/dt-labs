import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isInternalUser } from '@/lib/auth-utils'
import { GOOGLE_CALENDAR_SCOPES, googleCalendarRedirectUri, isGoogleCalendarConfigured } from '@/lib/google-calendar'

const BASE = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

/** GET /api/calendar/google/connect - sends the person to Google to allow access to their calendar. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.redirect(new URL('/login', BASE()))
  if (!isInternalUser((session.user as { role?: string }).role)) return NextResponse.redirect(new URL('/calendar?google=forbidden', BASE()))
  if (!isGoogleCalendarConfigured()) return NextResponse.redirect(new URL('/calendar?google=missing_config', BASE()))

  const nonce = randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleCalendarRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPES.join(' '),
    access_type: 'offline',
    // Always ask which Google account, so the calendar can be a different account from the support inbox.
    prompt: 'select_account consent',
    state: Buffer.from(JSON.stringify({ userId: session.user.id, nonce })).toString('base64url'),
  })
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  // The callback checks this against the state, so only the person who started the connection can finish it.
  res.cookies.set('gcal_oauth_nonce', nonce, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 600, path: '/' })
  return res
}
