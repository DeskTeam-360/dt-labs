import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companies,companyWebsites, crawlSessions } from '@/lib/db'

/** GET /api/crawl-sessions - List all crawl sessions with company_websites.companies */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({
      session: crawlSessions,
      websiteId: companyWebsites.id,
      websiteUrl: companyWebsites.url,
      websiteTitle: companyWebsites.title,
      companyId: companies.id,
      companyName: companies.name,
    })
    .from(crawlSessions)
    .leftJoin(companyWebsites, eq(crawlSessions.companyWebsiteId, companyWebsites.id))
    .leftJoin(companies, eq(companyWebsites.companyId, companies.id))
    .orderBy(desc(crawlSessions.createdAt))

  const data = rows.map((r) => ({
    id: r.session.id,
    company_website_id: r.session.companyWebsiteId,
    status: r.session.status,
    total_pages: r.session.totalPages,
    crawled_pages: r.session.crawledPages,
    failed_pages: r.session.failedPages,
    uncrawled_pages: r.session.uncrawledPages,
    broken_pages: r.session.brokenPages,
    error_message: r.session.errorMessage,
    max_depth: r.session.maxDepth,
    max_pages: r.session.maxPages,
    started_at: r.session.startedAt ? new Date(r.session.startedAt).toISOString() : null,
    completed_at: r.session.completedAt ? new Date(r.session.completedAt).toISOString() : null,
    created_at: r.session.createdAt ? new Date(r.session.createdAt).toISOString() : '',
    updated_at: r.session.updatedAt ? new Date(r.session.updatedAt).toISOString() : '',
    company_websites: r.websiteId
      ? {
          id: r.websiteId,
          company_id: r.companyId,
          url: r.websiteUrl,
          title: r.websiteTitle,
          companies: r.companyId ? { id: r.companyId, name: r.companyName } : null,
        }
      : null,
  }))

  return NextResponse.json(data)
}
