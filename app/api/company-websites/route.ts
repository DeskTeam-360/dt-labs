import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// GET - Get all company websites
export async function GET(request: Request) {
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

    // Get query params for filtering
    const { searchParams } = new URL(request.url)
    const company_id = searchParams.get('company_id')
    const is_primary = searchParams.get('is_primary')

    let query = supabase
      .from('company_websites')
      .select('*')
      .order('created_at', { ascending: false })

    if (company_id) {
      query = query.eq('company_id', company_id)
    }

    if (is_primary !== null) {
      query = query.eq('is_primary', is_primary === 'true')
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch company websites' }, { status: 500 })
  }
}

// POST - Create new company website
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
    const { company_id, url, title, description, is_primary } = body

    if (!company_id) {
      return NextResponse.json({ error: 'company_id is required' }, { status: 400 })
    }

    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    // If setting as primary, unset other primary websites for this company
    if (is_primary) {
      await supabase
        .from('company_websites')
        .update({ is_primary: false })
        .eq('company_id', company_id)
        .eq('is_primary', true)
    }

    const { data, error } = await supabase
      .from('company_websites')
      .insert({
        company_id,
        url,
        title: title || null,
        description: description || null,
        is_primary: is_primary || false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create company website' }, { status: 500 })
  }
}

