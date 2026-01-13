import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

const BUCKET_NAME = 'dtlabs'
const SCREENSHOTS_FOLDER = 'screenshots'

export async function POST(request: Request) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 401 })
    }

    // Validate token directly (avoid external fetch)
    const { createAdminClient } = await import('@/utils/supabase/admin')
    const adminSupabase = createAdminClient()

    const { data: tokenData, error: tokenError } = await adminSupabase
      .from('api_tokens')
      .select('user_id')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Check if token is expired
    const { data: fullTokenData } = await adminSupabase
      .from('api_tokens')
      .select('expires_at')
      .eq('token', token)
      .single()

    if (fullTokenData?.expires_at && new Date(fullTokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    // Update last_used_at
    await adminSupabase
      .from('api_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token)

    const user_id = tokenData.user_id

    // Use admin client to bypass RLS for server-side uploads
    const supabase = createAdminClient()

    // Get form data with file
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'File must be an image' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    // Check for active time tracker (todo yang sedang running)
    // Todo aktif = time tracker dengan stop_time NULL untuk user ini
    const { data: activeTimeTracker, error: trackerError } = await supabase
      .from('todo_time_tracker')
      .select('todo_id')
      .eq('user_id', user_id)
      .is('stop_time', null)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Auto-link to active todo if exists
    const todoId = activeTimeTracker?.todo_id || null

    if (trackerError) {
      console.warn('Error checking active time tracker:', trackerError)
      // Continue anyway, just won't auto-link
    }

    // Get user name and todo title for filename
    let userName = 'user'
    let todoTitle = 'screenshot'
    
    // Get user name
    const { data: userData } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', user_id)
      .single()
    
    if (userData) {
      // Extract first name only (take first word)
      let nameToUse = userData.full_name || userData.email || 'user'
      if (userData.full_name) {
        // Split by space and take first word
        const firstName = userData.full_name.trim().split(/\s+/)[0]
        nameToUse = firstName || userData.email || 'user'
      }
      
      userName = nameToUse
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    }

    // Get todo title if todo_id exists
    if (todoId) {
      const { data: todoData } = await supabase
        .from('todos')
        .select('title')
        .eq('id', todoId)
        .single()
      
      if (todoData?.title) {
        todoTitle = todoData.title
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50) // Limit length
      }
    }

    // Generate filename: nama-orang-todo-title-waktu
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '-')
      .split('.')[0] // Format: 2025-01-13-10-30-45
    const fileExt = file.name.split('.').pop() || 'png'
    const fileName = `screenshots/${userName}-${todoTitle}-${timestamp}.${fileExt}`
    const filePath = fileName

    // Upload file to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Upload error:', error)
      return NextResponse.json(
        { error: error.message || 'Upload failed' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'No data returned from upload' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path)

    // Extract filename from path (without folder)
    const generatedFileName = fileName.split('/').pop() || file.name

    // Save metadata to database
    const { data: screenshotRecord, error: dbError } = await supabase
      .from('screenshots')
      .insert({
        user_id: user_id,
        file_name: generatedFileName, // Use generated filename
        file_path: data.path,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        todo_id: todoId, // Auto-link to active todo
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (dbError) {
      console.error('Error saving screenshot metadata:', dbError)
      // Continue anyway, file is uploaded
    }

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: data.path,
      id: screenshotRecord?.id || null,
      todo_id: todoId,
      auto_linked: !!todoId // Indicate if auto-linked to active todo
    })
  } catch (error: any) {
    console.error('Failed to upload screenshot:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload screenshot' },
      { status: 500 }
    )
  }
}

// GET - List all screenshots
export async function GET(request: Request) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 401 })
    }

    // Validate token
    const adminSupabase = createAdminClient()

    const { data: tokenData, error: tokenError } = await adminSupabase
      .from('api_tokens')
      .select('user_id')
      .eq('token', token)
      .eq('is_active', true)
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Check if token is expired
    const { data: fullTokenData } = await adminSupabase
      .from('api_tokens')
      .select('expires_at')
      .eq('token', token)
      .single()

    if (fullTokenData?.expires_at && new Date(fullTokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 })
    }

    // Get query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const todoId = searchParams.get('todo_id')

    // Get screenshots from database (with todo integration)
    let query = adminSupabase
      .from('screenshots')
      .select(`
        *,
        todos (
          id,
          title,
          status
        )
      `)
      .eq('user_id', tokenData.user_id)

    // Filter by todo_id if provided
    if (todoId) {
      query = query.eq('todo_id', todoId)
    }

    const { data: screenshots, error: dbError } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (dbError) {
      console.error('Error fetching screenshots from database:', dbError)
      return NextResponse.json(
        { error: dbError.message || 'Failed to fetch screenshots' },
        { status: 500 }
      )
    }

    // Get total count
    const { count } = await adminSupabase
      .from('screenshots')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', tokenData.user_id)

    return NextResponse.json({
      success: true,
      screenshots: screenshots || [],
      total: count || 0
    })
  } catch (error: any) {
    console.error('Failed to list screenshots:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to list screenshots' },
      { status: 500 }
    )
  }
}
