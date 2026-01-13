import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Use admin client to check token (bypass RLS)
    const { createAdminClient } = await import('@/utils/supabase/admin')
    const supabase = createAdminClient()

    // Find token in database
    const { data: tokenData, error } = await supabase
      .from('api_tokens')
      .select('*, user_id')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (error || !tokenData) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Check if token is expired
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    // Update last_used_at
    await supabase
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenData.id)

    return NextResponse.json({
      valid: true,
      user_id: tokenData.user_id,
    })
  } catch (error: any) {
    console.error('Failed to validate token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate token' },
      { status: 500 }
    )
  }
}
