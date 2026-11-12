import { eq, isNull, or } from 'drizzle-orm'

import { companyWebsites, crawlSessions, db, wpSites } from '@/lib/db'
import { syncSiteAlarms } from '@/lib/wp-alarms'
import { siteMatchKey } from '@/lib/wp-monitor'
import { pullWpReport } from '@/lib/wp-pull'
import { probeAndStore } from '@/lib/wp-uptime'

export type WpCheckResult = { site: string; uptime_ok: boolean; report: 'fresh' | 'kept'; report_note: string | null; alarms_opened: number; alarms_cleared: number }

/**
 * One full look at a monitored site, on request: open its address, ask the plugin for a fresh report, bring its alarms up to date.
 * Used when a crawl finishes and by "Check now"; nothing here runs on a timer.
 */
export async function checkWpSite(site: typeof wpSites.$inferSelect): Promise<WpCheckResult> {
  let current = await probeAndStore(site)
  // A single failed visit is not an outage: look once more before the site counts as down.
  if (!current.uptimeOk) current = await probeAndStore(current)
  const pulled = await pullWpReport(current)
  if (pulled.ok) current = { ...pulled.site, uptimeOk: current.uptimeOk, uptimeStatus: current.uptimeStatus, uptimeMs: current.uptimeMs, uptimeCheckedAt: current.uptimeCheckedAt, uptimeFailCount: current.uptimeFailCount, uptimeDownSince: current.uptimeDownSince }
  const alarms = await syncSiteAlarms(current)
  return {
    site: site.name || site.siteUrl,
    uptime_ok: current.uptimeOk === true,
    report: pulled.ok ? 'fresh' : 'kept',
    report_note: pulled.ok ? null : pulled.message,
    alarms_opened: alarms.opened,
    alarms_cleared: alarms.cleared,
  }
}

/** When a crawl of a website finishes: if that website is a monitored WordPress site, look at it now. Returns null when it is not monitored. */
export async function checkWpAfterCrawl(sessionId: string): Promise<WpCheckResult | null> {
  const [row] = await db
    .select({ url: companyWebsites.url, companyId: companyWebsites.companyId })
    .from(crawlSessions)
    .innerJoin(companyWebsites, eq(crawlSessions.companyWebsiteId, companyWebsites.id))
    .where(eq(crawlSessions.id, sessionId))
    .limit(1)
  if (!row) return null
  const candidates = await db.select().from(wpSites).where(or(eq(wpSites.companyId, row.companyId), isNull(wpSites.companyId)))
  const key = siteMatchKey(row.url)
  const site = candidates.find((s) => siteMatchKey(s.siteUrl) === key)
  return site ? checkWpSite(site) : null
}
