import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const redirectUri = `${baseUrl}/api/email/google/callback`

    if (errorParam) {
      return NextResponse.redirect(new URL(`/email-integration?error=${errorParam}`, baseUrl))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/email-integration?error=no_code', baseUrl))
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/email-integration?error=missing_config', baseUrl))
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errData = await tokenResponse.text()
      console.error('Google token exchange failed:', errData)
      return NextResponse.redirect(new URL('/email-integration?error=token_exchange_failed', baseUrl))
    }

    const tokens = await tokenResponse.json()
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token
    const expiresIn = tokens.expires_in

    if (!accessToken) {
      return NextResponse.redirect(new URL('/email-integration?error=no_access_token', baseUrl))
    }

    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const userInfo = userInfoResponse.ok ? await userInfoResponse.json() : null
    const emailAddress = userInfo?.email || null

    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('email_integrations')
      .upsert(
        {
          provider: 'google',
          email_address: emailAddress,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          is_active: true,
          created_by: user?.id || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' }
      )

    if (error) {
      console.error('Failed to save email integration:', error)
      return NextResponse.redirect(new URL('/email-integration?error=save_failed', baseUrl))
    }

    return NextResponse.redirect(new URL('/email-integration?success=1', baseUrl))
  } catch (err) {
    console.error('Google callback error:', err)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    return NextResponse.redirect(new URL('/email-integration?error=callback_failed', baseUrl))
  }
}
