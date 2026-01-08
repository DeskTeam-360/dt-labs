import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Vercel serverless function configuration
export const maxDuration = 300 // 5 minutes (max for Pro plan, 10s for Hobby)
export const runtime = 'nodejs' // Use Node.js runtime for better compatibility

// POST - Create company website and start crawl
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
    const { 
      company_id, 
      url, 
      title, 
      description, 
      is_primary,
      max_depth = 3,
      max_pages = 100,
      company_website_id // Optional: if provided, use existing website instead of creating new one
    } = body

    let websiteId = company_website_id

    // If company_website_id not provided, create a new company website
    if (!websiteId) {
      if (!company_id || !url) {
        return NextResponse.json(
          { error: 'company_id and url are required when company_website_id is not provided' },
          { status: 400 }
        )
      }

      // If setting as primary, unset other primary websites for this company
      if (is_primary) {
        await supabase
          .from('company_websites')
          .update({ is_primary: false })
          .eq('company_id', company_id)
          .eq('is_primary', true)
      }

      // Create company website
      const { data: websiteData, error: websiteError } = await supabase
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

      if (websiteError) {
        return NextResponse.json({ error: websiteError.message }, { status: 400 })
      }

      if (!websiteData) {
        return NextResponse.json({ error: 'Failed to create company website' }, { status: 500 })
      }

      websiteId = websiteData.id
    } else {
      // Verify the company_website_id exists
      const { data: existingWebsite, error: checkError } = await supabase
        .from('company_websites')
        .select('id')
        .eq('id', websiteId)
        .single()

      if (checkError || !existingWebsite) {
        return NextResponse.json({ error: 'Invalid company_website_id' }, { status: 400 })
      }
    }

    // Create crawl session
    const { data: sessionData, error: sessionError } = await supabase
      .from('crawl_sessions')
      .insert({
        company_website_id: websiteId,
        status: 'pending',
        max_depth,
        max_pages,
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 400 })
    }

    if (!sessionData) {
      return NextResponse.json({ error: 'Failed to create crawl session' }, { status: 500 })
    }

    // Update session status to 'crawling'
    await supabase
      .from('crawl_sessions')
      .update({ status: 'crawling' })
      .eq('id', sessionData.id)

    // Start crawl process by calling separate endpoint (better for Vercel)
    // This ensures the process runs in a separate function context
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    console.log(`[API] Triggering crawl process for session ${sessionData.id} via separate endpoint`)
    
    // Call the process endpoint in background (fire and forget)
    fetch(`${siteUrl}/api/crawl/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify({
        crawl_session_id: sessionData.id,
        company_website_id: websiteId,
        max_depth,
        max_pages,
      }),
    }).catch((error) => {
      console.error('[API] Error triggering crawl process:', error)
      // Update session with error
      supabase
        .from('crawl_sessions')
        .update({
          status: 'failed',
          error_message: `Failed to trigger crawl: ${error.message}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionData.id)
        .then(({ error: updateError }) => {
          if (updateError) {
            console.error('[API] Error updating session status:', updateError)
          }
        })
    })

    return NextResponse.json(
      { 
        data: {
          crawl_session: sessionData,
          company_website_id: websiteId,
        },
        success: true,
        message: 'Crawl session created and started'
      },
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to start crawl' }, { status: 500 })
  }
}

// Removed duplicate functions - now imported from utils.ts

