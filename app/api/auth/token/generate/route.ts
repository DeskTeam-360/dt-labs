import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = body

    // Generate secure token
    const token = `sk_${randomBytes(32).toString('hex')}`

    // Calculate expiry (30 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    // Insert token into database
    const { data, error } = await supabase
      .from('api_tokens')
      .insert({
        user_id: user.id,
        token,
        name: name || 'Chrome Extension',
        expires_at: expiresAt.toISOString(),
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating token:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to create token' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      token: data.token,
      expires_at: data.expires_at,
      name: data.name,
    })
  } catch (error: any) {
    console.error('Failed to generate token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate token' },
      { status: 500 }
    )
  }
}
