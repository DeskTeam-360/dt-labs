import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'))
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const redirectUri = `${baseUrl}/api/email/google/callback`

    if (!clientId) {
      console.error('GOOGLE_CLIENT_ID is not set')
      return NextResponse.redirect(new URL('/email-integration?error=missing_config', baseUrl))
    }

    const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64url')
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Google connect error:', error)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    return NextResponse.redirect(new URL('/email-integration?error=connect_failed', baseUrl))
  }
}
