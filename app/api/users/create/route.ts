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

    // Insert user record into public.users table
    // Try insert first (in case trigger didn't fire or was disabled)
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        role: role || 'user',
        status: status || 'active',
      })

    // If insert fails because record already exists (from trigger), update it instead
    if (insertError) {
      // Check if error is due to duplicate (record already exists from trigger)
      if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('already exists')) {
        // Record already exists (trigger created it), just update it
        const { error: updateError } = await supabase
          .from('users')
          .update({
            full_name,
            role: role || 'user',
            status: status || 'active',
          })
          .eq('id', authData.user.id)

        if (updateError) {
          return NextResponse.json(
            { error: updateError.message },
            { status: 400 }
          )
        }
      } else {
        // Different error, return it
        return NextResponse.json(
          { error: insertError.message },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({ success: true, data: authData.user })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    )
  }
}

