import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

// PATCH - Update screenshot (link to todo, etc)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params
    const body = await request.json()
    const { todo_id, title, description } = body

    // Update screenshot
    const { data, error } = await adminSupabase
      .from('screenshots')
      .update({
        todo_id: todo_id || null,
        title: title || null,
        description: description || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', tokenData.user_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating screenshot:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to update screenshot' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      screenshot: data
    })
  } catch (error: any) {
    console.error('Failed to update screenshot:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update screenshot' },
      { status: 500 }
    )
  }
}

// DELETE - Delete screenshot
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    // Get screenshot first to get file path
    const { data: screenshot, error: fetchError } = await adminSupabase
      .from('screenshots')
      .select('file_path')
      .eq('id', id)
      .eq('user_id', tokenData.user_id)
      .single()

    if (fetchError || !screenshot) {
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 })
    }

    // Delete from database
    const { error: dbError } = await adminSupabase
      .from('screenshots')
      .delete()
      .eq('id', id)
      .eq('user_id', tokenData.user_id)

    if (dbError) {
      return NextResponse.json(
        { error: dbError.message || 'Failed to delete screenshot' },
        { status: 500 }
      )
    }

    // Delete from storage
    const { error: storageError } = await adminSupabase.storage
      .from('dtlabs')
      .remove([screenshot.file_path])

    if (storageError) {
      console.error('Error deleting from storage:', storageError)
      // Continue anyway, database record is deleted
    }

    return NextResponse.json({
      success: true
    })
  } catch (error: any) {
    console.error('Failed to delete screenshot:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete screenshot' },
      { status: 500 }
    )
  }
}
