import { buildGroups, type CrawlPageLite, groupKeyOf, isBrokenPage, isNoindex, isOkPage, pageKeyOf } from '@/lib/crawl-groups'

export type SeoPage = CrawlPageLite & { description: string | null; heading_hierarchy?: unknown }

export type SeoSeverity = 'error' | 'warning' | 'info'

export type SeoIssue = {
  /** stable key for the table */
  id: string
  url: string
  title: string | null
  groupKey: string
  code: string
  label: string
  severity: SeoSeverity
  detail: string
}

export const SEO_ISSUE_LABELS: Record<string, { label: string; severity: SeoSeverity }> = {
  title_missing: { label: 'Title missing', severity: 'error' },
  title_short: { label: 'Title too short', severity: 'warning' },
  title_long: { label: 'Title too long', severity: 'warning' },
  title_duplicate: { label: 'Duplicate title', severity: 'warning' },
  desc_missing: { label: 'Meta description missing', severity: 'error' },
  desc_short: { label: 'Meta description too short', severity: 'warning' },
  desc_long: { label: 'Meta description too long', severity: 'warning' },
  desc_duplicate: { label: 'Duplicate meta description', severity: 'warning' },
  h1_missing: { label: 'No H1 heading', severity: 'error' },
  h1_multiple: { label: 'More than one H1', severity: 'warning' },
  noindex: { label: 'Marked noindex', severity: 'info' },
}

const TITLE = { min: 30, max: 60 }
const DESC = { min: 120, max: 160 }

/** Counts H1 headings in the stored nested heading structure. */
function countH1(h: unknown): number {
  if (!h || typeof h !== 'object') return 0
  let n = 0
  for (const node of Object.values(h as Record<string, { level?: string; child?: unknown }>)) {
    if (!node || typeof node !== 'object') continue
    if ((node.level ?? '').toLowerCase() === 'h1') n++
    n += countH1(node.child)
  }
  return n
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** SEO checks on every page that loaded fine (each page once, fragments ignored). */
export function analyzeSeo(rawPages: SeoPage[]): SeoIssue[] {
  const seen = new Set<string>()
  const pages = rawPages.filter((p) => {
    const k = pageKeyOf(p.url)
    if (seen.has(k) || !isOkPage(p)) return false
    seen.add(k)
    return true
  })

  const titleCount = new Map<string, number>()
  const descCount = new Map<string, number>()
  for (const p of pages) {
    const t = norm(p.title).toLowerCase()
    const d = norm(p.description).toLowerCase()
    if (t) titleCount.set(t, (titleCount.get(t) ?? 0) + 1)
    if (d) descCount.set(d, (descCount.get(d) ?? 0) + 1)
  }

  const out: SeoIssue[] = []
  for (const p of pages) {
    const base = { url: p.url, title: p.title, groupKey: groupKeyOf(p.url) }
    const add = (code: string, detail: string) =>
      out.push({ ...base, id: `${p.url}|${code}`, code, label: SEO_ISSUE_LABELS[code].label, severity: SEO_ISSUE_LABELS[code].severity, detail })

    const t = norm(p.title)
    if (!t) add('title_missing', 'The page has no title.')
    else {
      if (t.length < TITLE.min) add('title_short', `${t.length} characters (aim for ${TITLE.min}-${TITLE.max}).`)
      if (t.length > TITLE.max) add('title_long', `${t.length} characters (aim for ${TITLE.min}-${TITLE.max}).`)
      const n = titleCount.get(t.toLowerCase()) ?? 0
      if (n > 1) add('title_duplicate', `${n - 1} other page(s) use the same title.`)
    }

    const d = norm(p.description)
    if (!d) add('desc_missing', 'The page has no meta description.')
    else {
      if (d.length < DESC.min) add('desc_short', `${d.length} characters (aim for ${DESC.min}-${DESC.max}).`)
      if (d.length > DESC.max) add('desc_long', `${d.length} characters (aim for ${DESC.min}-${DESC.max}).`)
      const n = descCount.get(d.toLowerCase()) ?? 0
      if (n > 1) add('desc_duplicate', `${n - 1} other page(s) use the same description.`)
    }

    if (p.heading_hierarchy !== undefined && p.heading_hierarchy !== null) {
      const h1 = countH1(p.heading_hierarchy)
      if (h1 === 0) add('h1_missing', 'The page has no H1 heading.')
      else if (h1 > 1) add('h1_multiple', `${h1} different H1 headings.`)
    }

    if (isNoindex(p)) add('noindex', 'The page asks search engines not to index it. Fine for private pages, a problem for pages that should rank.')
  }
  return out
}

export type SeoGroupSummary = { key: string; label: string; pages: number; error: number; warning: number; info: number }

/** Issues per group: how many pages were checked and how many problems of each severity. */
export function summarizeByGroup(pages: SeoPage[], issues: SeoIssue[]): SeoGroupSummary[] {
  const groups = buildGroups(pages)
  return groups.map((g) => {
    const mine = issues.filter((i) => i.groupKey === g.key)
    return {
      key: g.key,
      label: g.label,
      pages: g.ok,
      error: mine.filter((i) => i.severity === 'error').length,
      warning: mine.filter((i) => i.severity === 'warning').length,
      info: mine.filter((i) => i.severity === 'info').length,
    }
  })
}

export type BrokenLink = {
  url: string
  statusCode: number | null
  status: string
  message: string | null
  groupKey: string
  /** pages that link to it, each page once */
  foundOn: string[]
}

type LinkPage = CrawlPageLite & { links?: string[] | null; error_message?: string | null }

/** Pages that failed or answered with an error, with the crawled pages whose links point at them. */
export function findBrokenLinks(pages: LinkPage[]): BrokenLink[] {
  const referrers = new Map<string, Set<string>>()
  for (const p of pages) {
    const from = pageKeyOf(p.url)
    for (const l of p.links ?? []) {
      const to = pageKeyOf(l)
      if (to === from) continue
      let s = referrers.get(to)
      if (!s) referrers.set(to, (s = new Set()))
      s.add(p.url)
    }
  }
  const seen = new Set<string>()
  const out: BrokenLink[] = []
  for (const p of pages) {
    const k = pageKeyOf(p.url)
    if (seen.has(k)) continue
    if (!(isBrokenPage(p) || p.status === 'failed')) continue
    seen.add(k)
    out.push({
      url: p.url,
      statusCode: p.http_status_code,
      status: p.status,
      message: p.error_message ?? null,
      groupKey: groupKeyOf(p.url),
      foundOn: [...(referrers.get(k) ?? [])].sort(),
    })
  }
  return out
}
