import { type CrawlPageLite,isBrokenPage, isOkPage, pageKeyOf } from '@/lib/crawl-groups'

export type RobotsRule = { allow: boolean; path: string }

export type ParsedRobots = {
  /** rules of the `User-agent: *` group */
  rules: RobotsRule[]
  sitemaps: string[]
  /** other user-agents that have their own block, e.g. GPTBot */
  agents: string[]
}

/** Reads robots.txt: the rules for everyone (*), the Sitemap lines and the names of bots that have their own block. */
export function parseRobots(text: string): ParsedRobots {
  const out: ParsedRobots = { rules: [], sitemaps: [], agents: [] }
  let current: string[] = []
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i).trim().toLowerCase()
    const value = line.slice(i + 1).trim()
    if (key === 'user-agent') {
      if (!lastWasAgent) current = []
      current.push(value.toLowerCase())
      if (value !== '*' && !out.agents.includes(value)) out.agents.push(value)
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (key === 'sitemap') out.sitemaps.push(value)
    else if ((key === 'allow' || key === 'disallow') && current.includes('*') && value) out.rules.push({ allow: key === 'allow', path: value })
  }
  return out
}

function ruleMatches(rule: string, path: string): boolean {
  const re = '^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')
  try {
    return new RegExp(re).test(path)
  } catch {
    return false
  }
}

/** Whether `User-agent: *` may fetch this URL. The longest matching rule wins, Allow wins a tie. */
export function robotsAllows(rules: RobotsRule[], url: string): boolean {
  let path: string
  try {
    const u = new URL(url)
    path = u.pathname + u.search
  } catch {
    return true
  }
  let best: RobotsRule | null = null
  for (const r of rules) {
    if (!ruleMatches(r.path, path)) continue
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r
  }
  return best ? best.allow : true
}

/** The <loc> addresses of a sitemap or sitemap index. */
export function extractLocs(xml: string): string[] {
  const out: string[] = []
  for (const m of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)) {
    out.push(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
  }
  return out
}

export type SiteFiles = {
  origin: string
  robots: { status: number | null; text: string } | null
  sitemaps: Array<{ url: string; status: number | null; count: number }>
  /** every page address found in the sitemaps */
  urls: string[]
  truncated: boolean
}

export type SitemapComparison = {
  /** listed in the sitemap, the crawler never reached it */
  notCrawled: string[]
  /** crawled fine, but missing from the sitemap */
  notInSitemap: string[]
  /** listed in the sitemap, but the crawl found it broken */
  brokenInSitemap: string[]
  /** listed in the sitemap, but robots.txt blocks it */
  blockedInSitemap: string[]
  /** crawled, but robots.txt blocks it */
  crawledButBlocked: string[]
  /** listed in the sitemap and crawled fine */
  matched: number
}

const key = (u: string) => pageKeyOf(u).toLowerCase()

export function compareWithSitemap(pages: CrawlPageLite[], files: SiteFiles): SitemapComparison {
  const robots = parseRobots(files.robots?.text ?? '')
  const crawled = new Map<string, CrawlPageLite>()
  for (const p of pages) if (!crawled.has(key(p.url))) crawled.set(key(p.url), p)
  const inSitemap = new Map<string, string>()
  for (const u of files.urls) inSitemap.set(key(u), u)

  const out: SitemapComparison = { notCrawled: [], notInSitemap: [], brokenInSitemap: [], blockedInSitemap: [], crawledButBlocked: [], matched: 0 }
  for (const [k, u] of inSitemap) {
    const p = crawled.get(k)
    if (!robotsAllows(robots.rules, u)) out.blockedInSitemap.push(u)
    if (!p) out.notCrawled.push(u)
    else if (isBrokenPage(p) || p.status === 'failed') out.brokenInSitemap.push(u)
    else if (isOkPage(p)) out.matched++
  }
  for (const [k, p] of crawled) {
    if (!robotsAllows(robots.rules, p.url)) out.crawledButBlocked.push(p.url)
    if (isOkPage(p) && !inSitemap.has(k) && !/[?]/.test(p.url)) out.notInSitemap.push(p.url)
  }
  for (const list of [out.notCrawled, out.notInSitemap, out.brokenInSitemap, out.blockedInSitemap, out.crawledButBlocked]) list.sort()
  return out
}
