import { and, desc, eq, isNotNull, lt, ne } from 'drizzle-orm'

import { companies, companyPics, companyWebsites, crawlPages, crawlSessions, db, users } from '@/lib/db'
import { escapeHtml, sendHtmlEmail, siteUrl } from '@/lib/plain-email'

type Found = { text: string; tag: string; pages: string[] }
const MAX_LISTED = 40

const key = (url: string) => url.replace(/\/+$/, '').toLowerCase()

/** Every link to another domain found in one crawl, once each, with where it was found. */
async function externalLinksOf(sessionId: string): Promise<{ links: Map<string, Found & { url: string }>; pagesWithData: number }> {
  const rows = await db.select({ url: crawlPages.url, ext: crawlPages.externalLinks }).from(crawlPages).where(and(eq(crawlPages.crawlSessionId, sessionId), isNotNull(crawlPages.externalLinks)))
  const links = new Map<string, Found & { url: string }>()
  for (const r of rows) {
    for (const l of r.ext ?? []) {
      const k = key(l.url)
      const have = links.get(k)
      if (have) have.pages.push(r.url)
      else links.set(k, { url: l.url, text: l.text, tag: l.tag, pages: [r.url] })
    }
  }
  return { links, pagesWithData: rows.length }
}

/**
 * After a crawl finishes: links to other domains that were not there in the crawl before are emailed to the company's PICs,
 * so a backlink somebody slipped into the site is seen the same day. The first crawl (or one after a crawl that did not record
 * external links yet) is only the starting point and sends nothing.
 */
export async function alertNewExternalLinks(sessionId: string): Promise<{ sent: number; newLinks: number }> {
  const [session] = await db.select().from(crawlSessions).where(eq(crawlSessions.id, sessionId)).limit(1)
  if (!session) return { sent: 0, newLinks: 0 }

  const [previous] = await db
    .select({ id: crawlSessions.id })
    .from(crawlSessions)
    .where(and(eq(crawlSessions.companyWebsiteId, session.companyWebsiteId), eq(crawlSessions.status, 'completed'), ne(crawlSessions.id, sessionId), lt(crawlSessions.createdAt, session.createdAt)))
    .orderBy(desc(crawlSessions.createdAt))
    .limit(1)
  if (!previous) return { sent: 0, newLinks: 0 }

  const [before, now] = await Promise.all([externalLinksOf(previous.id), externalLinksOf(sessionId)])
  if (before.pagesWithData === 0) return { sent: 0, newLinks: 0 }
  const fresh = [...now.links.entries()].filter(([k]) => !before.links.has(k)).map(([, v]) => v)
  if (fresh.length === 0) return { sent: 0, newLinks: 0 }

  const [site] = await db.select().from(companyWebsites).where(eq(companyWebsites.id, session.companyWebsiteId)).limit(1)
  if (!site) return { sent: 0, newLinks: fresh.length }
  const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, site.companyId)).limit(1)
  const pics = await db
    .select({ email: users.email, name: users.fullName, status: users.status })
    .from(companyPics)
    .innerJoin(users, eq(companyPics.userId, users.id))
    .where(eq(companyPics.companyId, site.companyId))
  const to = pics.filter((p) => p.email && (!p.status || p.status === 'active'))
  if (to.length === 0) {
    console.warn(`[crawl-alert] ${fresh.length} new external link(s) on ${site.url} but the company has no PIC to tell`)
    return { sent: 0, newLinks: fresh.length }
  }

  const rows = fresh
    .slice(0, MAX_LISTED)
    .map(
      (l) =>
        `<tr><td style="padding:4px 8px"><a href="${escapeHtml(l.url)}">${escapeHtml(l.url)}</a></td><td style="padding:4px 8px">${escapeHtml(l.text || '(no text)')}</td><td style="padding:4px 8px">${escapeHtml(l.tag)}</td><td style="padding:4px 8px">${escapeHtml(l.pages[0])}${l.pages.length > 1 ? ` (+${l.pages.length - 1} more)` : ''}</td></tr>`
    )
    .join('')
  const more = fresh.length > MAX_LISTED ? `<p>...and ${fresh.length - MAX_LISTED} more.</p>` : ''
  const subject = `${fresh.length} new external link${fresh.length === 1 ? '' : 's'} found on ${company?.name ?? site.url}`
  const html =
    `<p>The latest crawl of <strong>${escapeHtml(site.url)}</strong> found ${fresh.length} link${fresh.length === 1 ? '' : 's'} to other sites that were not there in the crawl before. ` +
    `If you did not expect them, someone may have inserted a backlink.</p>` +
    `<table style="border-collapse:collapse;font-size:13px"><tr><th align="left" style="padding:4px 8px">Link</th><th align="left" style="padding:4px 8px">Text</th><th align="left" style="padding:4px 8px">Tag</th><th align="left" style="padding:4px 8px">First seen on</th></tr>${rows}</table>${more}` +
    `<p><a href="${siteUrl()}/crawl-sessions/${sessionId}">Open the crawl</a></p>`

  let sent = 0
  for (const p of to) if (await sendHtmlEmail(p.email, subject, html)) sent++
  return { sent, newLinks: fresh.length }
}
