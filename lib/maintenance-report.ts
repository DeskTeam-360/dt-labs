import { randomBytes } from 'crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { connect } from 'tls'

import { isHomePage } from '@/lib/crawl-auto-screenshots'
import {
  companies,
  companyWebsites,
  crawlPages,
  crawlSessions,
  db,
  maintenanceReportItems,
  maintenanceReports,
  maintenanceTemplateItems,
  maintenanceTemplates,
  screenshots,
  users,
  wpSites,
} from '@/lib/db'
import { assertPublicUrl } from '@/lib/web-screenshot'
import { evaluateWpSite } from '@/lib/wp-health'
import { siteMatchKey } from '@/lib/wp-monitor'

export const MAINTENANCE_TEMPLATE_KEYS = ['weekly', 'monthly'] as const
/** A crawl older than this is not used to fill the picture and link items (it would describe an old site). */
const CRAWL_MAX_AGE_DAYS = 14
const SAMPLE_PAGES = 3

type ItemRow = typeof maintenanceReportItems.$inferSelect
type Fill = { status: string | null; note?: string | null; link?: string | null }

const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' })

export async function createMaintenanceReport(params: { websiteId: string; templateKey: string; userId: string }) {
  const [website] = await db.select().from(companyWebsites).where(eq(companyWebsites.id, params.websiteId)).limit(1)
  if (!website) return { error: 'Website not found' as const }
  const [tpl] = await db.select().from(maintenanceTemplates).where(eq(maintenanceTemplates.key, params.templateKey)).limit(1)
  if (!tpl) return { error: 'Template not found' as const }
  const items = await db.select().from(maintenanceTemplateItems).where(eq(maintenanceTemplateItems.templateId, tpl.id)).orderBy(maintenanceTemplateItems.pos)

  const [report] = await db
    .insert(maintenanceReports)
    .values({ websiteId: website.id, companyId: website.companyId, templateKey: tpl.key, templateName: tpl.name, developerId: params.userId, createdBy: params.userId })
    .returning()
  if (items.length > 0) {
    await db.insert(maintenanceReportItems).values(items.map((i) => ({ reportId: report.id, pos: i.pos, section: i.section, label: i.label, options: i.options, source: i.source })))
  }
  await fillAutoItems(report.id)
  return { report }
}

// ---------- automatic checks ----------

async function checkSsl(host: string): Promise<{ ok: boolean; validTo: Date | null; error: string | null }> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate()
      const authorized = socket.authorized
      const validTo = cert?.valid_to ? new Date(cert.valid_to) : null
      socket.end()
      const expired = validTo ? validTo.getTime() < Date.now() : false
      resolve({ ok: authorized && !expired, validTo, error: authorized ? (expired ? 'expired' : null) : String(socket.authorizationError ?? 'not trusted') })
    })
    socket.on('error', (e) => resolve({ ok: false, validTo: null, error: e.message }))
    socket.on('timeout', () => {
      socket.destroy()
      resolve({ ok: false, validTo: null, error: 'timeout' })
    })
  })
}

async function reachable(url: string): Promise<boolean> {
  try {
    await assertPublicUrl(url)
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'DeskTeam360-Maintenance/1.0' } })
    return res.status < 400
  } catch {
    return false
  }
}

async function domainVariants(siteUrl: string, kind: 'www' | 'https'): Promise<Fill> {
  let host: string
  try {
    host = new URL(siteUrl).hostname.replace(/^www\./i, '')
  } catch {
    return { status: null }
  }
  const variants = kind === 'www' ? [`https://${host}/`, `https://www.${host}/`] : [`http://${host}/`, `https://${host}/`]
  const results = await Promise.all(variants.map(async (v) => ({ v, ok: await reachable(v) })))
  const bad = results.filter((r) => !r.ok)
  return bad.length === 0 ? { status: 'Done', note: 'All variants open (redirects count)' } : { status: 'Problem found', note: `Does not open: ${bad.map((b) => b.v).join(', ')}` }
}

async function latestCrawl(websiteId: string) {
  const [s] = await db
    .select()
    .from(crawlSessions)
    .where(and(eq(crawlSessions.companyWebsiteId, websiteId), eq(crawlSessions.status, 'completed')))
    .orderBy(desc(crawlSessions.createdAt))
    .limit(1)
  if (!s) return null
  const age = s.createdAt ? (Date.now() - new Date(s.createdAt).getTime()) / 86400000 : 999
  return { session: s, ageDays: age, fresh: age <= CRAWL_MAX_AGE_DAYS }
}

async function crawlShots(sessionId: string) {
  const rows = await db.select().from(screenshots).where(sql`${screenshots.tags} @> ARRAY[${`crawl:${sessionId}`}]::text[]`).orderBy(desc(screenshots.createdAt))
  const pages = await db.select({ url: crawlPages.url, depth: crawlPages.depth, title: crawlPages.title }).from(crawlPages).where(eq(crawlPages.crawlSessionId, sessionId))
  const titleOf = new Map(pages.map((p) => [p.url, p.title?.trim() || '']))
  const homeUrls = new Set(pages.filter(isHomePage).map((p) => p.url))
  return rows.map((r) => {
    const url = (r.tags ?? []).find((t) => t.startsWith('src:'))?.slice(4) ?? r.description ?? ''
    return { url, title: titleOf.get(url) ?? '', device: (r.tags ?? []).includes('device:mobile') ? ('mobile' as const) : ('desktop' as const), file: r.fileUrl, home: homeUrls.has(url) }
  })
}

/** Fills every item that has a source and has not been changed by a person. Items whose data is missing stay empty. */
export async function fillAutoItems(reportId: string): Promise<void> {
  const [report] = await db.select().from(maintenanceReports).where(eq(maintenanceReports.id, reportId)).limit(1)
  if (!report) return
  const [website] = await db.select().from(companyWebsites).where(eq(companyWebsites.id, report.websiteId)).limit(1)
  if (!website) return
  const items = await db.select().from(maintenanceReportItems).where(eq(maintenanceReportItems.reportId, reportId))
  const todo = items.filter((i) => i.source && !i.edited)
  if (todo.length === 0) return

  // The monitored WordPress site for this address, if there is one.
  const wpRows = await db.select().from(wpSites)
  const wp = wpRows.find((w) => siteMatchKey(w.siteUrl) === siteMatchKey(website.url))
  const facts = wp ? evaluateWpSite(wp.lastSeenAt, wp.lastReport as Record<string, unknown> | null).facts : null
  const crawl = todo.some((i) => i.source === 'broken_links' || i.source?.startsWith('shot_')) ? await latestCrawl(website.id) : null
  const shots = crawl?.fresh ? await crawlShots(crawl.session.id) : []

  let host = ''
  try {
    host = new URL(website.url).hostname
  } catch {
    /* an unusable address: SSL stays empty */
  }

  const fill = async (item: ItemRow): Promise<Fill> => {
    switch (item.source) {
      case 'ssl': {
        if (facts && facts.last_seen_at) {
          const ok = facts.ssl.https && !facts.ssl.expired
          const note = facts.ssl.valid_to ? `Expires On ${fmtDate(new Date(facts.ssl.valid_to))}` : facts.ssl.error
          return { status: ok ? item.options[0] : item.options[1] ?? item.options[0], note }
        }
        if (!host) return { status: null }
        const r = await checkSsl(host)
        return { status: r.ok ? item.options[0] : item.options[1] ?? item.options[0], note: r.validTo ? `Expires On ${fmtDate(r.validTo)}` : r.error }
      }
      case 'plugin_updates': {
        if (!facts || !facts.last_seen_at) return { status: null, note: 'This site is not reporting to WordPress Monitor' }
        if (facts.plugin_updates === 0) return { status: item.options[0] }
        return { status: item.options[1] ?? item.options[0], note: `Not updated: ${facts.plugin_update_list.map((p) => `${p.name}${p.version ? ` ${p.version}` : ''}${p.new_version ? ` -> ${p.new_version}` : ''}`).join(', ')}` }
      }
      case 'malware': {
        if (!facts || !facts.last_seen_at || !facts.wordfence.active || facts.wordfence.open_issues === null) return { status: null, note: 'Wordfence is not reporting for this site' }
        if (facts.wordfence.open_issues === 0) return { status: item.options[0] }
        return { status: item.options[1] ?? item.options[0], note: `${facts.wordfence.open_issues} Wordfence issue(s): ${facts.wordfence.issues.slice(0, 5).map((i) => i.message).join(' | ')}` }
      }
      case 'broken_links': {
        if (!crawl || !crawl.fresh) return { status: null, note: crawl ? `Last crawl is ${Math.floor(crawl.ageDays)} days old, crawl again` : 'No crawl yet' }
        const n = crawl.session.brokenPages ?? 0
        return n === 0 ? { status: item.options[0] } : { status: item.options[1] ?? item.options[0], note: `${n} broken page(s) in the latest crawl` }
      }
      case 'domain_www':
        return domainVariants(website.url, 'www')
      case 'domain_https':
        return domainVariants(website.url, 'https')
      case 'shot_home_desktop':
      case 'shot_home_mobile': {
        const device = item.source === 'shot_home_mobile' ? 'mobile' : 'desktop'
        const s = shots.find((x) => x.home && x.device === device)
        return s ? { status: item.options[0], note: s.file, link: s.file } : { status: null, note: crawl?.fresh ? 'No homepage picture in the latest crawl' : 'Crawl with pictures needed' }
      }
      case 'shot_inner_desktop':
      case 'shot_inner_mobile': {
        const device = item.source === 'shot_inner_mobile' ? 'mobile' : 'desktop'
        const list = shots.filter((x) => !x.home && x.device === device)
        const seen = new Set<string>()
        const picked = list.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true))).slice(0, SAMPLE_PAGES)
        if (picked.length === 0) return { status: null, note: crawl?.fresh ? 'No inner page pictures in the latest crawl' : 'Crawl with pictures needed' }
        return { status: item.options[0], note: picked.map((p) => `${p.title || 'Inner page'}: ${p.file}`).join('\n'), link: picked[0].file }
      }
      default:
        return { status: null }
    }
  }

  const results = await Promise.all(todo.map(async (i) => [i, await fill(i).catch((): Fill => ({ status: null }))] as const))
  for (const [item, r] of results) {
    await db
      .update(maintenanceReportItems)
      .set({
        status: r.status,
        note: r.note ?? null,
        linkUrl: r.link ?? null,
        autoFilled: r.status !== null,
        developerId: r.status !== null ? report.developerId : null,
        checkedOn: r.status !== null ? today() : null,
      })
      .where(eq(maintenanceReportItems.id, item.id))
  }
}

// ---------- reading ----------

/** The report with its header facts (customer, website, WordPress and PHP versions) and its items. */
export async function loadMaintenanceReport(reportId: string) {
  const [report] = await db.select().from(maintenanceReports).where(eq(maintenanceReports.id, reportId)).limit(1)
  if (!report) return null
  const [website] = await db.select().from(companyWebsites).where(eq(companyWebsites.id, report.websiteId)).limit(1)
  const [company] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, report.companyId)).limit(1)
  const [dev] = report.developerId ? await db.select({ first: users.firstName, last: users.lastName, email: users.email }).from(users).where(eq(users.id, report.developerId)).limit(1) : []
  const wpRows = website ? await db.select().from(wpSites) : []
  const wp = website ? wpRows.find((w) => siteMatchKey(w.siteUrl) === siteMatchKey(website.url)) : undefined
  const items = await db.select().from(maintenanceReportItems).where(eq(maintenanceReportItems.reportId, reportId)).orderBy(maintenanceReportItems.pos)
  return {
    report,
    header: {
      company_name: company?.name ?? '',
      website_url: website?.url ?? '',
      website_title: website?.title ?? '',
      wp_version: wp?.wpVersion ?? null,
      php_version: wp?.phpVersion ?? null,
      developer: dev ? [dev.first, dev.last].filter(Boolean).join(' ') || dev.email : null,
    },
    items,
  }
}

export const newShareToken = () => randomBytes(24).toString('base64url')

// ---------- the public page (hash address) ----------

/** The report behind a share hash. Only a final report that is being shared is returned. */
export async function loadSharedMaintenanceReport(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const [row] = await db.select({ id: maintenanceReports.id, status: maintenanceReports.status }).from(maintenanceReports).where(eq(maintenanceReports.shareToken, token)).limit(1)
  if (!row || row.status !== 'final') return null
  return loadMaintenanceReport(row.id)
}

/** Notes the system wrote from plugin and security scans stay inside the team: they name plugins and weaknesses. */
const PRIVATE_NOTE_SOURCES = new Set(['plugin_updates', 'malware'])
export const isPrivateNote = (item: { source: string | null; autoFilled: boolean; edited: boolean }) => !!item.source && PRIVATE_NOTE_SOURCES.has(item.source) && item.autoFilled && !item.edited
