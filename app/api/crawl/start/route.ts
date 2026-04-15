import { and, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyWebsites, crawlSessions } from '@/lib/db/schema'

// Vercel serverless function configuration
export const maxDuration = 300 // 5 minutes (max for Pro plan, 10s for Hobby)
export const runtime = 'nodejs' // Use Node.js runtime for better compatibility

// POST - Create company website and start crawl
export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
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
      company_website_id, // Optional: if provided, use existing website instead of creating new one
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
        await db
          .update(companyWebsites)
          .set({ isPrimary: false })
          .where(
            and(
              eq(companyWebsites.companyId, company_id),
              eq(companyWebsites.isPrimary, true)
            )
          )
      }

      // Create company website
      const [websiteData] = await db
        .insert(companyWebsites)
        .values({
          companyId: company_id,
          url,
          title: title || null,
          description: description || null,
          isPrimary: is_primary || false,
        })
        .returning()

      if (!websiteData) {
        return NextResponse.json({ error: 'Failed to create company website' }, { status: 500 })
      }

      websiteId = websiteData.id
    } else {
      // Verify the company_website_id exists
      const [existingWebsite] = await db
        .select({ id: companyWebsites.id })
        .from(companyWebsites)
        .where(eq(companyWebsites.id, websiteId))
        .limit(1)

      if (!existingWebsite) {
        return NextResponse.json({ error: 'Invalid company_website_id' }, { status: 400 })
      }
    }

    // Create crawl session
    const [sessionData] = await db
      .insert(crawlSessions)
      .values({
        companyWebsiteId: websiteId,
        status: 'pending',
        maxDepth: max_depth,
        maxPages: max_pages,
        startedAt: new Date(),
      })
      .returning()

    if (!sessionData) {
      return NextResponse.json({ error: 'Failed to create crawl session' }, { status: 500 })
    }

    // Update session status to 'crawling'
    await db
      .update(crawlSessions)
      .set({ status: 'crawling' })
      .where(eq(crawlSessions.id, sessionData.id))

    // Start crawl process by calling separate endpoint (better for Vercel)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    console.log(`[API] Triggering crawl process for session ${sessionData.id} via separate endpoint`)

    const cookieStore = await cookies()

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
    }).catch(async (error) => {
      console.error('[API] Error triggering crawl process:', error)
      await db
        .update(crawlSessions)
        .set({
          status: 'failed',
          errorMessage: `Failed to trigger crawl: ${error.message}`,
          completedAt: new Date(),
        })
        .where(eq(crawlSessions.id, sessionData.id))
    })

    return NextResponse.json(
      {
        data: {
          crawl_session: sessionData,
          company_website_id: websiteId,
        },
        success: true,
        message: 'Crawl session created and started',
      },
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to start crawl' }, { status: 500 })
  }
}
