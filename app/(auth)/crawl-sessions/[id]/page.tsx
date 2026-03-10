import { auth } from '@/auth'
import { db, crawlSessions, companyWebsites, companies } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import CrawlSessionDetailContent from '@/components/CrawlSessionDetailContent'

function toSessionUser(u: { id: string; email?: string | null; name?: string | null; image?: string | null }) {
  return { id: u.id, email: u.email ?? undefined, user_metadata: { full_name: u.name, avatar_url: u.image } }
}

export default async function CrawlSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params

  const [row] = await db
    .select({ session: crawlSessions, website: companyWebsites, company: companies })
    .from(crawlSessions)
    .innerJoin(companyWebsites, eq(crawlSessions.companyWebsiteId, companyWebsites.id))
    .innerJoin(companies, eq(companyWebsites.companyId, companies.id))
    .where(eq(crawlSessions.id, id))
    .limit(1)

  if (!row) redirect('/crawl-sessions')

  const s = row.session
  const crawlSession = {
    id: s.id,
    status: s.status,
    total_pages: s.totalPages,
    crawled_pages: s.crawledPages,
    failed_pages: s.failedPages,
    uncrawled_pages: s.uncrawledPages,
    broken_pages: s.brokenPages,
    error_message: s.errorMessage,
    max_depth: s.maxDepth,
    max_pages: s.maxPages,
    started_at: s.startedAt?.toISOString() ?? null,
    completed_at: s.completedAt?.toISOString() ?? null,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
    company_websites: {
      id: row.website.id,
      company_id: row.website.companyId,
      url: row.website.url,
      title: row.website.title,
      description: row.website.description,
      companies: { id: row.company.id, name: row.company.name },
    },
  }

  return <CrawlSessionDetailContent user={toSessionUser(session.user)} crawlSession={crawlSession} />
}

