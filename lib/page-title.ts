const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' }

/** Turns &amp; &#8211; &#x2013; and the like into the characters they stand for. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''
    }
    return NAMED[code.toLowerCase()] ?? m
  })
}

/** "about-us" -> "About Us" (used when a page has no usable title). */
function titleFromUrl(url: string): string {
  try {
    const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
  } catch {
    return ''
  }
}

/**
 * A page title made readable for a report: entities decoded, the site name after a separator (" | ", " - ", " – ", " » ") dropped,
 * odd symbols removed. Falls back to the last part of the address when nothing is left.
 */
export function cleanPageTitle(raw: string | null | undefined, url = ''): string {
  let t = decodeEntities(String(raw ?? ''))
  t = t.split(/\s+[|–—·»•-]\s+/)[0] ?? t
  t = t.replace(/[^\p{L}\p{N}\s&'.,()/]/gu, ' ').replace(/\s+/g, ' ').trim()
  return t || titleFromUrl(url) || 'Page'
}
