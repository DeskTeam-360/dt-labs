import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { extractLocs, parseRobots, type SiteFiles } from '@/lib/crawl-site-files'
import { companyWebsites, crawlSessions, db } from '@/lib/db'

const MAX_SITEMAPS = 20
const MAX_URLS = 10000
const MAX_BYTES = 5 * 1024 * 1024

async function fetchText(url: string): Promise<{ status: number | null; text: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Deskteam360-Crawler' }, redirect: 'follow' })
    const buf = await res.arrayBuffer()
    const text = buf.byteLength > MAX_BYTES ? '' : new TextDecoder().decode(buf)
    return { status: res.status, text: res.ok ? text : '' }
  } catch {
    return { status: null, text: '' }
  }
}

/** GET /api/crawl-sessions/[id]/site-files - the website's own robots.txt and sitemap(s), read live. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user || session.user.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const [row] = await db
    .select({ url: companyWebsites.url })
    .from(crawlSessions)
    .leftJoin(companyWebsites, eq(crawlSessions.companyWebsiteId, companyWebsites.id))
    .where(eq(crawlSessions.id, id))
    .limit(1)
  if (!row?.url) return NextResponse.json({ error: 'Crawl session not found' }, { status: 404 })

  let origin: string
  try {
    origin = new URL(row.url).origin
  } catch {
    return NextResponse.json({ error: 'The website address is not valid' }, { status: 400 })
  }

  const robots = await fetchText(`${origin}/robots.txt`)
  const listed = parseRobots(robots.text).sitemaps
  // Only the site's own address is fetched, so a robots.txt cannot point this server at other hosts.
  const sameOrigin = (u: string) => {
    try {
      return new URL(u).origin === origin
    } catch {
      return false
    }
  }
  const queue = [...new Set([...(listed.length ? listed : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`])].filter(sameOrigin))]

  const sitemaps: SiteFiles['sitemaps'] = []
  const urls = new Set<string>()
  const seen = new Set<string>()
  let truncated = false
  while (queue.length > 0) {
    const url = queue.shift()!
    if (seen.has(url)) continue
    seen.add(url)
    if (sitemaps.length >= MAX_SITEMAPS) {
      truncated = true
      break
    }
    const { status, text } = await fetchText(url)
    const locs = extractLocs(text)
    if (/<sitemapindex/i.test(text)) {
      sitemaps.push({ url, status, count: locs.length })
      for (const l of locs) if (sameOrigin(l) && !seen.has(l)) queue.push(l)
      continue
    }
    sitemaps.push({ url, status, count: locs.length })
    for (const l of locs) {
      if (urls.size >= MAX_URLS) {
        truncated = true
        break
      }
      urls.add(l)
    }
  }

  const data: SiteFiles = {
    origin,
    robots: { status: robots.status, text: robots.text },
    sitemaps,
    urls: [...urls],
    truncated,
  }
  return NextResponse.json({ data })
}
