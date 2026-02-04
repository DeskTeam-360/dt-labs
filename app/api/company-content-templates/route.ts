import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// GET - Get all company content templates
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

    const { data, error } = await supabase
      .from('company_content_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch content templates' },
      { status: 500 }
    )
  }
}

// POST - Create new company content template
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
    const { title, content, description, type, fields } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const insertData: Record<string, unknown> = {
      title,
      content: content || null,
      description: description || null,
    }
    if (type !== undefined) insertData.type = type || null
    if (Array.isArray(fields)) insertData.fields = fields.length ? fields : null

    const { data, error } = await supabase
      .from('company_content_templates')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data, success: true }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create content template' },
      { status: 500 }
    )
  }
}

