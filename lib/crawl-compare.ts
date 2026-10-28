import { type CrawlPageLite, isBrokenPage, pageKeyOf } from '@/lib/crawl-groups'

export type ComparePage = CrawlPageLite & { description?: string | null }

export type CompareChange = { field: 'title' | 'description' | 'status'; before: string; after: string }

export type CompareRow = {
  key: string
  url: string
  kind: 'added' | 'removed' | 'changed' | 'newly-broken' | 'fixed'
  changes: CompareChange[]
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const statusText = (p: ComparePage) => (p.http_status_code ? String(p.http_status_code) : p.status)

function byKey(pages: ComparePage[]) {
  const m = new Map<string, ComparePage>()
  for (const p of pages) {
    const k = pageKeyOf(p.url)
    if (!m.has(k)) m.set(k, p)
  }
  return m
}

/** What changed between an earlier crawl (before) and a later one (after). Each page counts once. */
export function compareCrawls(before: ComparePage[], after: ComparePage[]): CompareRow[] {
  const b = byKey(before)
  const a = byKey(after)
  const rows: CompareRow[] = []

  for (const [k, p] of a) {
    const old = b.get(k)
    if (!old) {
      rows.push({ key: k, url: p.url, kind: 'added', changes: [] })
      continue
    }
    const changes: CompareChange[] = []
    if (norm(old.title) !== norm(p.title)) changes.push({ field: 'title', before: norm(old.title), after: norm(p.title) })
    if (norm(old.description) !== norm(p.description)) changes.push({ field: 'description', before: norm(old.description), after: norm(p.description) })
    if (statusText(old) !== statusText(p)) changes.push({ field: 'status', before: statusText(old), after: statusText(p) })
    if (changes.length === 0) continue
    const kind = !isBrokenPage(old) && isBrokenPage(p) ? 'newly-broken' : isBrokenPage(old) && !isBrokenPage(p) ? 'fixed' : 'changed'
    rows.push({ key: k, url: p.url, kind, changes })
  }
  for (const [k, p] of b) if (!a.has(k)) rows.push({ key: k, url: p.url, kind: 'removed', changes: [] })
  return rows
}
