'use server'

import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

interface StartCrawlParams {
  company_id?: string
  url?: string
  title?: string
  description?: string
  is_primary?: boolean
  company_website_id?: string
  max_depth?: number
  max_pages?: number
}

/**
 * Server action to create a company website and start a crawl session
 */
export async function startCrawl(params: StartCrawlParams) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Unauthorized', success: false }
    }

    const {
      company_id,
      url,
      title,
      description,
      is_primary,
      company_website_id,
      max_depth = 3,
      max_pages = 100,
    } = params

    let websiteId = company_website_id

    // If company_website_id not provided, create a new company website
    if (!websiteId) {
      if (!company_id || !url) {
        return {
          error: 'company_id and url are required when company_website_id is not provided',
          success: false,
        }
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
        return { error: websiteError.message, success: false }
      }

      if (!websiteData) {
        return { error: 'Failed to create company website', success: false }
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
        return { error: 'Invalid company_website_id', success: false }
      }
    }

    // Call the API route to start the crawl
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/crawl/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieStore.toString(),
      },
      body: JSON.stringify({
        company_website_id: websiteId,
        max_depth,
        max_pages,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return { error: result.error || 'Failed to start crawl', success: false }
    }

    return {
      data: result.data,
      success: true,
      message: result.message || 'Crawl session created and started',
    }
  } catch (error: any) {
    return { error: error.message || 'Failed to start crawl', success: false }
  }
}

/**
 * Server action to get crawl sessions for a company website
 */
export async function getCrawlSessions(company_website_id: string) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Unauthorized', success: false }
    }

    const { data, error } = await supabase
      .from('crawl_sessions')
      .select('*')
      .eq('company_website_id', company_website_id)
      .order('created_at', { ascending: false })

    if (error) {
      return { error: error.message, success: false }
    }

    return { data, success: true }
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch crawl sessions', success: false }
  }
}

/**
 * Server action to get crawl pages for a crawl session
 */
export async function getCrawlPages(crawl_session_id: string) {
  try {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Unauthorized', success: false }
    }

    const { data, error } = await supabase
      .from('crawl_pages')
      .select('*')
      .eq('crawl_session_id', crawl_session_id)
      .order('depth', { ascending: true })
      .order('crawled_at', { ascending: true })

    if (error) {
      return { error: error.message, success: false }
    }

    return { data, success: true }
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch crawl pages', success: false }
  }
}

