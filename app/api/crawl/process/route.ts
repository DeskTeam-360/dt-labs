import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Vercel serverless function configuration
export const maxDuration = 300 // 5 minutes
export const runtime = 'nodejs'

// POST - Process crawl (called internally or via webhook)
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
    const { crawl_session_id, company_website_id, max_depth = 3, max_pages = 100 } = body

    if (!crawl_session_id || !company_website_id) {
      return NextResponse.json({ error: 'crawl_session_id and company_website_id are required' }, { status: 400 })
    }

    // Import and call the crawl process function
    const { startCrawlProcess } = await import('../utils')
    
    // Start the crawl process
    await startCrawlProcess(supabase, crawl_session_id, company_website_id, max_depth, max_pages)

    return NextResponse.json({ success: true, message: 'Crawl process completed' })
  } catch (error: any) {
    console.error('[Crawl Process] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to process crawl' }, { status: 500 })
  }
}

