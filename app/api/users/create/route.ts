import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)
    const body = await request.json()

    const { email, password, full_name, role, status } = body

    // Create auth user using admin API (requires service role key)
    // For now, we'll use signUp and then update users table
    // In production, use service role key for admin.createUser
    
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/dashboard`,
      },
    })

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 400 }
      )
    }

    // Wait a bit for trigger to create user record
    await new Promise(resolve => setTimeout(resolve, 500))

    // Update user record (trigger already created it with default values)
    const { error: userError } = await supabase
      .from('users')
      .update({
        full_name,
        role: role || 'user',
        status: status || 'active',
      })
      .eq('id', authData.user.id)

    // If update fails, try insert (in case trigger didn't fire)
    if (userError && userError.code === 'PGRST116') {
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          full_name,
          role: role || 'user',
          status: status || 'active',
        })

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 }
        )
      }
    } else if (userError) {
      return NextResponse.json(
        { error: userError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data: authData.user })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    )
  }
}

