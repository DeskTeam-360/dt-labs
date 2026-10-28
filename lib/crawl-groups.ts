/**
 * Grouping and file generation for a website crawl.
 * A page belongs to the group named by the first part of its path: /services/seo -> "Services" (/services/*).
 * Pages directly under the site root (/about, /contact, the home page) fall in "Top-level pages".
 */

export type CrawlPageLite = {
  url: string
  title: string | null
  depth: number
  status: string
  http_status_code: number | null
  content_type: string | null
  meta_tags?: Record<string, string> | null
  crawled_at: string | null
}

export type CrawlGroup = {
  /** "/services/*" or "/" for the top-level group */
  key: string
  label: string
  prefix: string
  pages: CrawlPageLite[]
  ok: number
  broken: number
  other: number
}

export const TOP_LEVEL_KEY = '/'

function pathOf(url: string): string[] {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)
  } catch {
    return []
  }
}

/** The group key of a URL: `/blog/*` for /blog/post-1, `/` for /about or the home page. */
export function groupKeyOf(url: string): string {
  const parts = pathOf(url)
  return parts.length >= 2 ? `/${parts[0]}/*` : TOP_LEVEL_KEY
}

function labelOf(key: string): string {
  if (key === TOP_LEVEL_KEY) return 'Top-level pages'
  const seg = key.split('/')[1] ?? key
  let decoded = seg
  try {
    decoded = decodeURIComponent(seg)
  } catch {
    /* keep raw */
  }
  return decoded.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** A page that was fetched and is a normal HTML page (what a sitemap should list). */
export function isOkPage(p: CrawlPageLite): boolean {
  if (p.status !== 'completed') return false
  if (p.http_status_code != null && (p.http_status_code < 200 || p.http_status_code >= 300)) return false
  return !p.content_type || /html/i.test(p.content_type)
}

export function isBrokenPage(p: CrawlPageLite): boolean {
  return p.status === 'broken-page' || (p.http_status_code != null && p.http_status_code >= 400)
}

export function isNoindex(p: CrawlPageLite): boolean {
  return /noindex/i.test(p.meta_tags?.robots ?? '')
}

/** The address without #fragment and without a trailing slash: the page itself. */
export function pageKeyOf(url: string): string {
  return url.replace(/#.*$/, '').replace(/\/$/, '')
}

export function buildGroups(pages: CrawlPageLite[]): CrawlGroup[] {
  const map = new Map<string, CrawlGroup>()
  // Older crawls stored /page#a and /page#b as separate rows. They are one page.
  const seenPage = new Set<string>()
  for (const p of pages) {
    const pk = pageKeyOf(p.url)
    if (seenPage.has(pk)) continue
    seenPage.add(pk)
    const key = groupKeyOf(p.url)
    let g = map.get(key)
    if (!g) {
      g = { key, label: labelOf(key), prefix: key === TOP_LEVEL_KEY ? '/' : key.replace('/*', '/'), pages: [], ok: 0, broken: 0, other: 0 }
      map.set(key, g)
    }
    g.pages.push(p)
    if (isOkPage(p)) g.ok++
    else if (isBrokenPage(p)) g.broken++
    else g.other++
  }
  return [...map.values()].sort((a, b) => {
    if (a.key === TOP_LEVEL_KEY) return -1
    if (b.key === TOP_LEVEL_KEY) return 1
    return b.pages.length - a.pages.length || a.label.localeCompare(b.label)
  })
}

/** Site origin taken from the shallowest crawled page. */
export function originOf(pages: CrawlPageLite[], fallbackUrl?: string): string {
  const first = [...pages].sort((a, b) => a.depth - b.depth)[0]?.url ?? fallbackUrl
  try {
    return first ? new URL(first).origin : ''
  } catch {
    return ''
  }
}

/** Paths that normally should not be indexed: admin, login, cart, account, internal search. */
const PRIVATE_SEGMENTS = /^(wp-admin|wp-login\.php|wp-json|admin|login|logout|signin|sign-in|register|cart|checkout|my-account|account|dashboard|cgi-bin|search|thank-you|preview)$/i

export function looksPrivate(group: CrawlGroup): boolean {
  if (group.key === TOP_LEVEL_KEY) return false
  return PRIVATE_SEGMENTS.test(group.key.split('/')[1] ?? '')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

export type SitemapOptions = {
  /** Group keys to include */
  groups: string[]
  skipQuery: boolean
  skipNoindex: boolean
  addLastmod: boolean
  addPriority: boolean
}

/** sitemap.xml for the pages that were fetched fine, in the chosen groups. */
export function generateSitemapXml(pages: CrawlPageLite[], opts: SitemapOptions): { xml: string; count: number } {
  const seen = new Set<string>()
  const lines: string[] = []
  const sorted = [...pages].sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url))
  for (const p of sorted) {
    if (!isOkPage(p)) continue
    if (!opts.groups.includes(groupKeyOf(p.url))) continue
    if (opts.skipNoindex && isNoindex(p)) continue
    let u: URL
    try {
      u = new URL(p.url)
    } catch {
      continue
    }
    if (opts.skipQuery && u.search) continue
    u.hash = ''
    const loc = u.toString()
    if (seen.has(loc)) continue
    seen.add(loc)
    const parts = [`    <loc>${esc(loc)}</loc>`]
    if (opts.addLastmod && p.crawled_at) parts.push(`    <lastmod>${p.crawled_at.slice(0, 10)}</lastmod>`)
    if (opts.addPriority) {
      const pr = p.depth <= 0 ? '1.0' : p.depth === 1 ? '0.8' : p.depth === 2 ? '0.6' : '0.5'
      parts.push(`    <priority>${pr}</priority>`)
    }
    lines.push(`  <url>\n${parts.join('\n')}\n  </url>`)
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`
  return { xml, count: lines.length }
}

export type RobotsOptions = {
  origin: string
  /** Group keys to block (Disallow) */
  blocked: string[]
  /** Extra Disallow paths, one per line */
  extraDisallow: string
  /** Include the Sitemap: line */
  sitemap: boolean
  /** Include a User-agent: * Allow / line when nothing is blocked */
}

/** A starter robots.txt. Blocking a group writes `Disallow: /group/`. */
export function generateRobotsTxt(opts: RobotsOptions): string {
  const lines = ['User-agent: *']
  const disallow = [
    ...opts.blocked.filter((k) => k !== TOP_LEVEL_KEY).map((k) => k.replace('/*', '/')),
    ...opts.extraDisallow.split('\n').map((l) => l.trim()).filter(Boolean),
  ]
  const unique = [...new Set(disallow.map((d) => (d.startsWith('/') ? d : `/${d}`)))]
  if (unique.length === 0) lines.push('Allow: /')
  else for (const d of unique) lines.push(`Disallow: ${d}`)
  if (opts.sitemap && opts.origin) lines.push('', `Sitemap: ${opts.origin}/sitemap.xml`)
  return lines.join('\n') + '\n'
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
