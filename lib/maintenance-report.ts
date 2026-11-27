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
import { resolveBranding } from '@/lib/maintenance-sources'
import { cleanPageTitle } from '@/lib/page-title'
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

export async function createMaintenanceReport(params: { websiteId: string; templateKey: string; userId: string; crawlSessionId?: string }) {
  const [website] = await db.select().from(companyWebsites).where(eq(companyWebsites.id, params.websiteId)).limit(1)
  if (!website) return { error: 'Website not found' as const }
  const [doneCrawl] = await db
    .select({ id: crawlSessions.id })
    .from(crawlSessions)
    .where(and(eq(crawlSessions.companyWebsiteId, website.id), eq(crawlSessions.status, 'completed'), ...(params.crawlSessionId ? [eq(crawlSessions.id, params.crawlSessionId)] : [])))
    .orderBy(desc(crawlSessions.createdAt))
    .limit(1)
  if (!doneCrawl) return { error: 'Crawl this website first, a maintenance report needs a finished crawl' as const }
  const [tpl] = await db.select().from(maintenanceTemplates).where(eq(maintenanceTemplates.key, params.templateKey)).limit(1)
  if (!tpl || !tpl.isActive) return { error: 'Template not found' as const }
  const items = await db.select().from(maintenanceTemplateItems).where(eq(maintenanceTemplateItems.templateId, tpl.id)).orderBy(maintenanceTemplateItems.pos)

  const [report] = await db
    .insert(maintenanceReports)
    .values({ websiteId: website.id, companyId: website.companyId, crawlSessionId: doneCrawl.id, templateKey: tpl.key, templateName: tpl.name, developerId: params.userId, createdBy: params.userId })
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

/** The crawl a report is tied to; reports made before the tie was added use the latest crawl of the website. */
async function reportCrawl(report: { crawlSessionId: string | null }, websiteId: string) {
  if (report.crawlSessionId) {
    const [s] = await db.select().from(crawlSessions).where(eq(crawlSessions.id, report.crawlSessionId)).limit(1)
    if (s) return { session: s, ageDays: 0, fresh: true }
  }
  return latestCrawl(websiteId)
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
  let items = await db.select().from(maintenanceReportItems).where(eq(maintenanceReportItems.reportId, reportId))

  // A report keeps a copy of its template's items. Items nobody has touched take the automatic source the template has now (matched by name),
  // so a source chosen in the template after the report was made still applies.
  const [tpl] = await db.select().from(maintenanceTemplates).where(eq(maintenanceTemplates.key, report.templateKey)).limit(1)
  if (tpl) {
    const tplItems = await db.select().from(maintenanceTemplateItems).where(eq(maintenanceTemplateItems.templateId, tpl.id))
    const byLabel = new Map(tplItems.map((t) => [t.label.trim().toLowerCase(), t]))
    for (const it of items) {
      const t = byLabel.get(it.label.trim().toLowerCase())
      if (t && t.source && !it.edited && it.source !== t.source) {
        await db.update(maintenanceReportItems).set({ source: t.source, options: t.options }).where(eq(maintenanceReportItems.id, it.id))
      }
    }
    items = await db.select().from(maintenanceReportItems).where(eq(maintenanceReportItems.reportId, reportId))
  }
  const todo = items.filter((i) => i.source && !i.edited)
  if (todo.length === 0) return

  // The monitored WordPress site for this address, if there is one.
  const wpRows = await db.select().from(wpSites)
  const wp = wpRows.find((w) => siteMatchKey(w.siteUrl) === siteMatchKey(website.url))
  const crawl = await reportCrawl(report, website.id)
  // What the site reported when the crawl was checked; reports made before that, or crawls never checked, use the latest data.
  const snap = (crawl?.session.wpSnapshot as { facts?: ReturnType<typeof evaluateWpSite>['facts'] } | null | undefined)?.facts ?? null
  const live = wp ? evaluateWpSite(wp.lastSeenAt, wp.lastReport as Record<string, unknown> | null).facts : null
  // A snapshot kept before a field existed does not have it: that field then comes from the latest data instead of being missing.
  type Facts = ReturnType<typeof evaluateWpSite>['facts']
  const facts: Facts | null = snap && live ? ({ ...live, ...snap, wordfence: { ...live.wordfence, ...snap.wordfence }, forms: { ...live.forms, ...(snap.forms ?? {}) } } as Facts) : (snap ?? live)
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
      case 'spam_comments': {
        if (!facts || !facts.last_seen_at || facts.comments_spam == null) return { status: null, note: 'This site is not reporting comments to WordPress Monitor' }
        return facts.comments_spam === 0 ? { status: item.options[0] } : { status: item.options[1] ?? item.options[0], note: `${facts.comments_spam} spam comment(s) to remove` }
      }
      case 'spam_forms': {
        if (!facts || !facts.last_seen_at) return { status: null, note: 'This site is not reporting to WordPress Monitor' }
        if (!facts.forms?.active || facts.forms.spam == null) return { status: 'N/A', note: 'Gravity Forms is not used on this site' }
        return facts.forms.spam === 0 ? { status: item.options[0] } : { status: item.options[1] ?? item.options[0], note: `${facts.forms.spam} spam form entr${facts.forms.spam === 1 ? 'y' : 'ies'} to remove` }
      }
      case 'uploads_code_exec': {
        if (!facts || !facts.last_seen_at || !facts.wordfence.active) return { status: null, note: 'Wordfence is not reporting for this site' }
        if (facts.wordfence.uploads_exec_disabled == null) return { status: null, note: 'The plugin on the site cannot read this Wordfence setting yet, update it' }
        return facts.wordfence.uploads_exec_disabled ? { status: item.options[0] } : { status: item.options[1] ?? item.options[0], note: 'Code execution in the Uploads directory is still allowed. Turn it off in Wordfence, All Options.' }
      }
      case 'file_manager': {
        if (!facts || !facts.last_seen_at || facts.installed_plugins == null) return { status: null, note: 'The plugin on the site cannot list the installed plugins yet, update it' }
        const found = facts.installed_plugins.filter((p) => /file[\s_-]?manager|filemanager/i.test(`${p.slug} ${p.name}`))
        return found.length === 0 ? { status: item.options[0] } : { status: item.options[1] ?? item.options[0], note: `Still installed: ${found.map((p) => `${p.name}${p.active ? ' (active)' : ''}`).join(', ')}` }
      }
      case 'gravatar_off': {
        if (!facts || !facts.last_seen_at || facts.avatars_enabled == null) return { status: null, note: 'The plugin on the site cannot read this setting yet, update it' }
        return facts.avatars_enabled ? { status: item.options[1] ?? item.options[0], note: 'Avatars (Gravatar) are still shown. Turn them off in Settings, Discussion.' } : { status: item.options[0] }
      }
      case 'dummy_user': {
        if (!facts || !facts.last_seen_at || facts.administrators == null) return { status: null, note: 'This site is not reporting its administrators to WordPress Monitor' }
        // A warning only: names that look like a leftover test account. A person decides whether it is one.
        const odd = facts.administrators.filter((a) => /^(admin|administrator|test|tester|demo|dummy|temp|user|root|support)\d*$/i.test(a.login) || /(dummy|test|demo|temp)/i.test(a.login) || /@(example|test|dummy|mailinator)\./i.test(a.email))
        return odd.length === 0 ? { status: item.options[0] } : { status: item.options[1] ?? item.options[0], note: `Check these administrators: ${odd.map((a) => `${a.login}${a.email ? ` (${a.email})` : ''}`).join(', ')}` }
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
        return s ? { status: item.options[0], note: `Homepage: ${s.file}`, link: s.file } : { status: null, note: crawl?.fresh ? 'No homepage picture in the latest crawl' : 'Crawl with pictures needed' }
      }
      case 'shot_inner_desktop':
      case 'shot_inner_mobile': {
        const device = item.source === 'shot_inner_mobile' ? 'mobile' : 'desktop'
        const list = shots.filter((x) => !x.home && x.device === device)
        const seen = new Set<string>()
        const picked = list.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true))).slice(0, SAMPLE_PAGES)
        if (picked.length === 0) return { status: null, note: crawl?.fresh ? 'No inner page pictures in the latest crawl' : 'Crawl with pictures needed' }
        return { status: item.options[0], note: picked.map((p) => `${cleanPageTitle(p.title, p.url)}: ${p.file}`).join('\n'), link: picked[0].file }
      }
      default:
        return { status: null }
    }
  }

  const results = await Promise.all(todo.map(async (i) => [i, await fill(i).catch((e): Fill => ({ status: null, note: `Could not check this item: ${e instanceof Error ? e.message : 'unknown error'}` }))] as const))
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
  const [tpl] = await db.select().from(maintenanceTemplates).where(eq(maintenanceTemplates.key, report.templateKey)).limit(1)
  const branding = resolveBranding(tpl ?? { name: report.templateName })
  const [dev] = report.developerId ? await db.select({ first: users.firstName, last: users.lastName, email: users.email }).from(users).where(eq(users.id, report.developerId)).limit(1) : []
  const wpRows = website ? await db.select().from(wpSites) : []
  const wp = website ? wpRows.find((w) => siteMatchKey(w.siteUrl) === siteMatchKey(website.url)) : undefined
  const items = await db.select().from(maintenanceReportItems).where(eq(maintenanceReportItems.reportId, reportId)).orderBy(maintenanceReportItems.pos)
  const [bound] = report.crawlSessionId ? await db.select({ snap: crawlSessions.wpSnapshot }).from(crawlSessions).where(eq(crawlSessions.id, report.crawlSessionId)).limit(1) : []
  const snapFacts = (bound?.snap as { facts?: { wp_version?: string | null; php_version?: string | null } } | null | undefined)?.facts ?? null
  const crawlRows = await db
    .select({ id: crawlSessions.id, createdAt: crawlSessions.createdAt, totalPages: crawlSessions.totalPages, brokenPages: crawlSessions.brokenPages })
    .from(crawlSessions)
    .where(and(eq(crawlSessions.companyWebsiteId, report.websiteId), eq(crawlSessions.status, 'completed')))
    .orderBy(desc(crawlSessions.createdAt))
  const crawls = crawlRows.map((c) => ({ id: c.id, created_at: c.createdAt ? new Date(c.createdAt).toISOString() : '', total_pages: c.totalPages ?? 0, broken_pages: c.brokenPages ?? 0 }))
  return {
    report,
    crawls,
    branding,
    header: {
      company_name: company?.name ?? '',
      website_url: website?.url ?? '',
      website_title: website?.title ?? '',
      wp_version: snapFacts?.wp_version ?? wp?.wpVersion ?? null,
      php_version: snapFacts?.php_version ?? wp?.phpVersion ?? null,
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
const PRIVATE_NOTE_SOURCES = new Set(['plugin_updates', 'malware', 'uploads_code_exec', 'file_manager', 'dummy_user'])
export const isPrivateNote = (item: { source: string | null; autoFilled: boolean; edited: boolean }) => !!item.source && PRIVATE_NOTE_SOURCES.has(item.source) && item.autoFilled && !item.edited
