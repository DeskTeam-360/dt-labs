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

    // Start crawl process (async - don't wait for it to complete)
    // In production, you might want to use a background job queue like BullMQ or similar
    console.log(`[API] Starting crawl process for session ${sessionData.id} in background`)
    startCrawlProcess(supabase, sessionData.id, websiteId, max_depth, max_pages).catch((error) => {
      console.error('[API] Error in crawl process:', error)
      // Update session with error
      supabase
        .from('crawl_sessions')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error occurred during crawl',
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

// Normalize URL to avoid duplicate crawling (normalize trailing slash)
// For root URLs (e.g., https://example.com/ and https://example.com), always use with trailing slash
// For other URLs, remove trailing slash
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // For root URLs (pathname is '/' or empty), always use with trailing slash
    if (urlObj.pathname === '/' || urlObj.pathname === '') {
      return urlObj.origin + '/'
    }
    // For other URLs, remove trailing slash to normalize
    return url.replace(/\/$/, '')
  } catch {
    // If URL parsing fails, just remove trailing slash
    return url.replace(/\/$/, '')
  }
}

// Crawl process function (this should be implemented based on your crawling logic)
async function startCrawlProcess(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  companyWebsiteId: string,
  maxDepth: number,
  maxPages: number
) {
  // Create a new Supabase client for this async process to ensure it works in Vercel
  // The original supabase client might not work in background async functions
  const cookieStore = await cookies()
  const freshSupabase = createClient(cookieStore)
  
  console.log(`[Crawl] Starting process for session ${sessionId}, website ${companyWebsiteId}`)

  // Get company website URL
  const { data: website, error: websiteError } = await freshSupabase
    .from('company_websites')
    .select('url')
    .eq('id', companyWebsiteId)
    .single()

  if (websiteError || !website) {
    console.error('[Crawl] Failed to fetch company website:', websiteError)
    throw new Error('Failed to fetch company website')
  }

  console.log(`[Crawl] Starting from URL: ${website.url}`)

  const startUrl = website.url
  const visitedUrls = new Set<string>() // Store normalized URLs
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }]
  
  let crawledCount = 0
  let failedCount = 0

  // Simple crawler implementation
  // In production, you'd want to use a proper web scraping library
  while (queue.length > 0 && crawledCount < maxPages) {
    const { url: currentUrl, depth } = queue.shift()!

    // Normalize URL for duplicate checking
    const normalizedUrl = normalizeUrl(currentUrl)

    if (visitedUrls.has(normalizedUrl) || depth > maxDepth) {
      continue
    }

    visitedUrls.add(normalizedUrl)

    try {
      // Fetch page content with timeout, retry logic, and better error handling
      let response: Response | null = null
      let lastError: Error | null = null
      const maxRetries = 3
      let retryCount = 0
      
      while (retryCount < maxRetries) {
        try {
          // Create AbortController for timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 seconds timeout

          response = await fetch(currentUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
            },
            signal: controller.signal,
            // Add redirect handling
            redirect: 'follow',
            // Add cache control for Vercel
            cache: 'no-store',
          })

          clearTimeout(timeoutId)
          lastError = null
          break // Success, exit retry loop
        } catch (fetchError: any) {
          lastError = fetchError
          retryCount++
          
          // If it's the last retry, give up
          if (retryCount >= maxRetries) {
            // Handle fetch errors (network errors, CORS, timeout, etc.)
            failedCount++
            const errorMessage = fetchError.name === 'AbortError' 
              ? 'Request timeout after retries' 
              : fetchError.message || 'Network error after retries'
            
            await freshSupabase.from('crawl_pages').insert({
              crawl_session_id: sessionId,
              url: currentUrl,
              depth,
              status: 'failed',
              error_message: errorMessage,
              crawled_at: new Date().toISOString(),
            })

            await supabase
              .from('crawl_sessions')
              .update({
                failed_pages: failedCount,
              })
              .eq('id', sessionId)

            continue
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
        }
      }
      
      // If we exhausted retries or response is null, skip this URL
      if (lastError || !response) {
        continue
      }

      const contentType = response.headers.get('content-type') || ''
      const httpStatus = response.status

      if (!response.ok || !contentType.includes('text/html')) {
        failedCount++
        await freshSupabase.from('crawl_pages').insert({
          crawl_session_id: sessionId,
          url: currentUrl,
          depth,
          status: 'failed',
          http_status_code: httpStatus,
          content_type: contentType,
          error_message: `HTTP ${httpStatus}: ${response.statusText}`,
          crawled_at: new Date().toISOString(),
        })

        // Update session
        await freshSupabase
          .from('crawl_sessions')
          .update({
            crawled_pages: crawledCount,
            failed_pages: failedCount,
          })
          .eq('id', sessionId)

        continue
      }

      let html: string
      try {
        html = await response.text()
      } catch (textError: any) {
        // Handle text parsing errors
        failedCount++
        await freshSupabase.from('crawl_pages').insert({
          crawl_session_id: sessionId,
          url: currentUrl,
          depth,
          status: 'failed',
          http_status_code: httpStatus,
          content_type: contentType,
          error_message: `Failed to parse response: ${textError.message}`,
          crawled_at: new Date().toISOString(),
        })

        await freshSupabase
          .from('crawl_sessions')
          .update({
            failed_pages: failedCount,
          })
          .eq('id', sessionId)

        continue
      }
      
      // Parse HTML (simplified - in production, use a proper HTML parser like cheerio)
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : null

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
      const description = descMatch ? descMatch[1].trim() : null

      // Extract links (simplified)
      const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi)
      const links: string[] = []
      for (const match of linkMatches) {
        let linkUrl = match[1]
        // Convert relative URLs to absolute
        if (linkUrl.startsWith('/')) {
          try {
            const baseUrl = new URL(currentUrl)
            linkUrl = new URL(linkUrl, baseUrl.origin).href
          } catch {
            continue
          }
        } else if (!linkUrl.startsWith('http')) {
          continue
        }
        
        // Only add links from the same domain
        try {
          const currentDomain = new URL(currentUrl).hostname
          const linkDomain = new URL(linkUrl).hostname
          // Normalize link URL for duplicate checking
          const normalizedLinkUrl = normalizeUrl(linkUrl)
          if (linkDomain === currentDomain && !visitedUrls.has(normalizedLinkUrl) && depth < maxDepth) {
            links.push(linkUrl)
            queue.push({ url: linkUrl, depth: depth + 1 })
          }
        } catch {
          continue
        }
      }

      // Extract headings with order and build nested structure
      interface HeadingNode {
        level: string
        child?: Record<string, HeadingNode>
      }

      type HeadingStructure = Record<string, HeadingNode>

      // Extract all headings (h1-h6) in order with their text content
      const headingRegex = /<(h[1-6])[^>]*>(.*?)<\/h[1-6]>/gi
      const headingsInOrder: Array<{ level: string; text: string }> = []
      let match
      while ((match = headingRegex.exec(html)) !== null) {
        const level = match[1].toLowerCase()
        // Remove HTML tags from heading text
        const rawText = match[2].replace(/<[^>]*>/g, '').trim()
        if (rawText) {
          headingsInOrder.push({ level, text: rawText })
        }
      }

      // Build nested structure based on heading hierarchy
      const buildHeadingHierarchy = (items: Array<{ level: string; text: string }>): HeadingStructure => {
        if (items.length === 0) {
          return {}
        }

        const result: HeadingStructure = {}
        const stack: Array<{ structure: HeadingStructure; level: number }> = [
          { structure: result, level: 0 }
        ]

        for (const item of items) {
          const currentLevel = parseInt(item.level.replace('h', ''))
          const headingText = item.text

          // Pop stack until we find the right parent level
          // Parent level should be less than current level
          while (stack.length > 1 && stack[stack.length - 1].level >= currentLevel) {
            stack.pop()
          }

          const parent = stack[stack.length - 1].structure

          // Create new node
          const newNode: HeadingNode = {
            level: item.level,
          }

          // Initialize child structure for potential children
          const childStructure: HeadingStructure = {}
          newNode.child = childStructure

          // Add to parent
          parent[headingText] = newNode

          // Push to stack for potential children
          stack.push({ structure: childStructure, level: currentLevel })
        }

        // Clean up empty child objects
        const cleanEmptyChildren = (structure: HeadingStructure): void => {
          for (const key in structure) {
            if (structure[key].child && Object.keys(structure[key].child || {}).length === 0) {
              delete structure[key].child
            } else if (structure[key].child) {
              cleanEmptyChildren(structure[key].child!)
            }
          }
        }

        cleanEmptyChildren(result)
        return result
      }

      const headingHierarchy = buildHeadingHierarchy(headingsInOrder)

      // Extract meta tags - handle both name and property attributes
      const metaTags: Record<string, string> = {}
      
      // Match meta tags with name attribute: <meta name="..." content="...">
      const nameMatches = html.matchAll(/<meta[^>]*name=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)
      for (const match of nameMatches) {
        metaTags[match[1]] = match[2]
      }
      
      // Match meta tags with property attribute (Open Graph, Twitter Cards): <meta property="..." content="...">
      const propertyMatches = html.matchAll(/<meta[^>]*property=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)
      for (const match of propertyMatches) {
        metaTags[match[1]] = match[2]
      }
      
      // Also handle meta tags where content comes before name/property
      const reverseNameMatches = html.matchAll(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']([^"']+)["'][^>]*>/gi)
      for (const match of reverseNameMatches) {
        if (!metaTags[match[2]]) {
          metaTags[match[2]] = match[1]
        }
      }
      
      const reversePropertyMatches = html.matchAll(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']([^"']+)["'][^>]*>/gi)
      for (const match of reversePropertyMatches) {
        if (!metaTags[match[2]]) {
          metaTags[match[2]] = match[1]
        }
      }

      // Save crawled page
      const { error: insertError } = await freshSupabase.from('crawl_pages').insert({
        crawl_session_id: sessionId,
        url: currentUrl,
        title,
        description,
        depth,
        status: 'completed',
        http_status_code: httpStatus,
        content_type: contentType,
        heading_hierarchy: headingHierarchy,
        meta_tags: metaTags,
        links: links,
        crawled_at: new Date().toISOString(),
      })

      if (insertError) {
        console.error(`[Crawl] Error inserting page ${currentUrl}:`, insertError)
        failedCount++
        await freshSupabase.from('crawl_pages').insert({
          crawl_session_id: sessionId,
          url: currentUrl,
          depth,
          status: 'failed',
          error_message: `Database error: ${insertError.message}`,
          crawled_at: new Date().toISOString(),
        })
        
        await freshSupabase
          .from('crawl_sessions')
          .update({
            failed_pages: failedCount,
          })
          .eq('id', sessionId)
        
        continue
      }

      crawledCount++
      console.log(`[Crawl] Saved page ${crawledCount}/${maxPages}: ${currentUrl}`)
      console.log(`Successfully crawled page ${crawledCount}: ${currentUrl}`)

      // Update session progress
      const { error: updateError } = await freshSupabase
        .from('crawl_sessions')
        .update({
          crawled_pages: crawledCount,
          failed_pages: failedCount,
          total_pages: crawledCount + failedCount,
        })
        .eq('id', sessionId)

      if (updateError) {
        console.error(`[Crawl] Error updating session progress:`, updateError)
      }

      // Add a small delay to be respectful to the server
      await new Promise(resolve => setTimeout(resolve, 1000))

    } catch (error: any) {
      failedCount++
      const errorMessage = error.message || error.toString() || 'Unknown error'
      console.error(`Error crawling ${currentUrl}:`, errorMessage, error)
      
      await supabase.from('crawl_pages').insert({
        crawl_session_id: sessionId,
        url: currentUrl,
        depth,
        status: 'failed',
        error_message: errorMessage,
        crawled_at: new Date().toISOString(),
      })

      await supabase
        .from('crawl_sessions')
        .update({
          failed_pages: failedCount,
        })
        .eq('id', sessionId)
    }
  }

  // Mark crawl session as completed
  console.log(`[Crawl] Completed session ${sessionId}: ${crawledCount} crawled, ${failedCount} failed`)
  
  const { error: finalUpdateError } = await freshSupabase
    .from('crawl_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_pages: crawledCount + failedCount,
      crawled_pages: crawledCount,
      failed_pages: failedCount,
    })
    .eq('id', sessionId)

  if (finalUpdateError) {
    console.error(`[Crawl] Error marking session as completed:`, finalUpdateError)
    throw finalUpdateError
  }
  
  console.log(`[Crawl] Session ${sessionId} completed successfully`)
}

