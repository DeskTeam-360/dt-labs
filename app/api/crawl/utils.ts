import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

// Normalize URL to avoid duplicate crawling (normalize trailing slash)
// For root URLs (e.g., https://example.com/ and https://example.com), always use with trailing slash
// For other URLs, remove trailing slash
export function normalizeUrl(url: string): string {
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
export async function startCrawlProcess(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  companyWebsiteId: string,
  maxDepth: number,
  maxPages: number
) {
  // Create a new Supabase client for this async process to ensure it works in Vercel
  // Use service role key for background operations if available, otherwise use regular client
  let freshSupabase: ReturnType<typeof createClient>
  
  try {
    const cookieStore = await cookies()
    freshSupabase = createClient(cookieStore)
  } catch (error) {
    // If cookies() fails in background (which can happen in Vercel), use the passed supabase client
    console.warn('[Crawl] Could not create fresh Supabase client, using passed client:', error)
    freshSupabase = supabase
  }
  
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

  console.log(`[Crawl] Starting crawl from: ${website.url}`)

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

          // Try to fetch with better error handling for Vercel
          // Remove Accept-Encoding as Vercel/Node.js handles this automatically
          response = await fetch(currentUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
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
          
          // Log error for debugging
          console.error(`[Crawl] Fetch error (attempt ${retryCount}/${maxRetries}) for ${currentUrl}:`, {
            name: fetchError.name,
            message: fetchError.message,
            cause: fetchError.cause,
            stack: fetchError.stack,
          })
          
          // If it's the last retry, give up
          if (retryCount >= maxRetries) {
            // Handle fetch errors (network errors, CORS, timeout, etc.)
            failedCount++
            let errorMessage = 'Network error after retries'
            
            if (fetchError.name === 'AbortError') {
              errorMessage = 'Request timeout after retries'
            } else if (fetchError.message) {
              errorMessage = `Fetch failed: ${fetchError.message}`
            } else if (typeof fetchError === 'string') {
              errorMessage = `Fetch failed: ${fetchError}`
            } else if (fetchError.toString && fetchError.toString() !== '[object Object]') {
              errorMessage = `Fetch failed: ${fetchError.toString()}`
            } else {
              errorMessage = 'Fetch failed: Unknown error (check Vercel logs)'
            }
            
            // Log detailed error for debugging in Vercel
            console.error('[Crawl] Final fetch error after retries:', {
              url: currentUrl,
              error: fetchError,
              errorName: fetchError.name,
              errorMessage: fetchError.message,
              errorStack: fetchError.stack,
              errorCause: fetchError.cause,
            })
            
            await freshSupabase.from('crawl_pages').insert({
              crawl_session_id: sessionId,
              url: currentUrl,
              depth,
              status: 'failed',
              error_message: errorMessage,
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
      console.error(`[Crawl] Error crawling ${currentUrl}:`, errorMessage, error)
      
      await freshSupabase.from('crawl_pages').insert({
        crawl_session_id: sessionId,
        url: currentUrl,
        depth,
        status: 'failed',
        error_message: errorMessage,
        crawled_at: new Date().toISOString(),
      })

      await freshSupabase
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

