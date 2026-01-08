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

  // Verify session exists before starting
  const { data: sessionCheck, error: sessionCheckError } = await freshSupabase
    .from('crawl_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single()

  if (sessionCheckError || !sessionCheck) {
    console.error('[Crawl] Session not found or invalid:', sessionCheckError)
    throw new Error(`Crawl session ${sessionId} not found in database`)
  }

  console.log(`[Crawl] Session verified: ${sessionId}, status: ${sessionCheck.status}`)

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
  let uncrawledCount = 0 // Track uncrawlable pages (non-HTML content)

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
      
      // If we exhausted retries or response is null, save as failed and skip
      if (lastError || !response) {
        failedCount++
        const errorMessage = lastError 
          ? (lastError.message || lastError.toString() || 'Fetch failed after retries')
          : 'No response received after retries'
        
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

      const contentType = response.headers.get('content-type') || ''
      const httpStatus = response.status
      const finalUrl = response.url // URL final setelah redirect (jika ada)
      
      // Detect redirect: jika final URL berbeda dengan current URL, berarti ada redirect
      const isRedirect = finalUrl !== currentUrl
      const redirectInfo = isRedirect ? `Redirected from ${currentUrl} to ${finalUrl}` : null

      // Handle failed responses (bukan redirect yang berhasil)
      // Jika redirect berhasil (response.ok = true), kita akan process HTML-nya
      // Jadi kita hanya skip jika response tidak OK dan bukan redirect yang berhasil
      if (!response.ok) {
        failedCount++
        await freshSupabase.from('crawl_pages').insert({
          crawl_session_id: sessionId,
          url: currentUrl,
          depth,
          status: 'failed',
          http_status_code: httpStatus,
          content_type: contentType,
          error_message: `HTTP ${httpStatus}: ${response.statusText}${isRedirect ? `. ${redirectInfo}` : ''}`,
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

      // Handle non-HTML responses (hanya jika bukan redirect)
      // Jika redirect, kita tetap process meskipun mungkin bukan HTML
      // Non-HTML content bukan failed, tapi uncrawlable (seperti images, PDFs, dll)
      if (!contentType.includes('text/html') && !isRedirect) {
        uncrawledCount++
        await freshSupabase.from('crawl_pages').insert({
          crawl_session_id: sessionId,
          url: currentUrl,
          depth,
          status: 'uncrawl-page',
          http_status_code: httpStatus,
          content_type: contentType,
          error_message: `Non-HTML content: ${contentType}`,
          crawled_at: new Date().toISOString(),
        })

        // Update session - uncrawl-page tidak dihitung sebagai failed atau crawled
        await freshSupabase
          .from('crawl_sessions')
          .update({
            crawled_pages: crawledCount,
            failed_pages: failedCount,
            uncrawled_pages: uncrawledCount,
            total_pages: crawledCount + failedCount + uncrawledCount,
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
      // Include redirect information if redirect was detected
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
        error_message: isRedirect ? redirectInfo : null, // Store redirect info in error_message field for tracking
        crawled_at: new Date().toISOString(),
      })

      if (insertError) {
        console.error(`[Crawl] Error inserting page ${currentUrl}:`, insertError)
        failedCount++
        
        // Try to save failed page with detailed error message
        const detailedErrorMessage = `Database error: ${insertError.message}${insertError.code ? ` (code: ${insertError.code})` : ''}${insertError.details ? ` - ${insertError.details}` : ''}`
        
        try {
          // Check if error is due to foreign key constraint (session doesn't exist)
          if (insertError.code === '23503' && insertError.details?.includes('crawl_sessions')) {
            console.error(`[Crawl] CRITICAL: Session ${sessionId} no longer exists in database. Stopping crawl.`)
            // Try to mark session as failed before stopping (if it still exists)
            try {
              await freshSupabase
                .from('crawl_sessions')
                .update({
                  status: 'failed',
                  error_message: `Crawl stopped: Session was deleted during crawl process. Last URL: ${currentUrl}`,
                  completed_at: new Date().toISOString(),
                })
                .eq('id', sessionId)
            } catch (updateError) {
              // Session might not exist, so this is expected
              console.error(`[Crawl] Could not update deleted session:`, updateError)
            }
            // Stop crawling since session doesn't exist
            break
          }
          
          // Verify session still exists before trying to insert failed page
          const { data: sessionVerify } = await freshSupabase
            .from('crawl_sessions')
            .select('id')
            .eq('id', sessionId)
            .single()
          
          if (!sessionVerify) {
            console.error(`[Crawl] CRITICAL: Session ${sessionId} no longer exists. Cannot save failed page. Stopping crawl.`)
            break // Stop crawling
          }
          
          const { error: failedInsertError } = await freshSupabase.from('crawl_pages').insert({
            crawl_session_id: sessionId,
            url: currentUrl,
            depth,
            status: 'failed',
            error_message: detailedErrorMessage,
            crawled_at: new Date().toISOString(),
          })
          
          if (failedInsertError) {
            // If insert failed page also fails (e.g., foreign key constraint), log it with full details
            const criticalErrorDetails = {
              originalError: {
                message: insertError.message,
                code: insertError.code,
                details: insertError.details,
                hint: insertError.hint,
              },
              failedPageInsertError: {
                message: failedInsertError.message,
                code: failedInsertError.code,
                details: failedInsertError.details,
                hint: failedInsertError.hint,
              },
              sessionId,
              url: currentUrl,
              depth,
              timestamp: new Date().toISOString(),
            }
            console.error(`[Crawl] CRITICAL: Failed to save failed page record for ${currentUrl}:`, JSON.stringify(criticalErrorDetails, null, 2))
            
            // If it's a foreign key error, stop crawling
            if (failedInsertError.code === '23503' && failedInsertError.details?.includes('crawl_sessions')) {
              console.error(`[Crawl] CRITICAL: Session ${sessionId} no longer exists. Stopping crawl.`)
              break
            }
            
            // Try to save error to session error_message as fallback
            try {
              await freshSupabase
                .from('crawl_sessions')
                .update({
                  error_message: `CRITICAL: Failed to save failed page for ${currentUrl}. Original error: ${insertError.message}. Failed page insert error: ${failedInsertError.message}`,
                })
                .eq('id', sessionId)
            } catch (updateError) {
              console.error(`[Crawl] CRITICAL: Also failed to update session error_message:`, updateError)
            }
            // Still increment failed count and try to update session
          }
        } catch (saveError: any) {
          console.error(`[Crawl] CRITICAL: Exception while saving failed page for ${currentUrl}:`, {
            originalError: insertError,
            saveError,
            sessionId,
            url: currentUrl,
          })
        }
        
        // Try to update session failed count
        try {
          await freshSupabase
            .from('crawl_sessions')
            .update({
              failed_pages: failedCount,
            })
            .eq('id', sessionId)
        } catch (updateError) {
          console.error(`[Crawl] Error updating failed_pages count:`, updateError)
        }
        
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
          uncrawled_pages: uncrawledCount,
          total_pages: crawledCount + failedCount + uncrawledCount,
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
  console.log(`[Crawl] Completed session ${sessionId}: ${crawledCount} crawled, ${failedCount} failed, ${uncrawledCount} uncrawled`)
  
  const { error: finalUpdateError } = await freshSupabase
    .from('crawl_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_pages: crawledCount + failedCount + uncrawledCount,
      crawled_pages: crawledCount,
      failed_pages: failedCount,
      uncrawled_pages: uncrawledCount,
    })
    .eq('id', sessionId)

  if (finalUpdateError) {
    console.error(`[Crawl] Error marking session as completed:`, finalUpdateError)
    throw finalUpdateError
  }
  
  console.log(`[Crawl] Session ${sessionId} completed successfully`)
}

