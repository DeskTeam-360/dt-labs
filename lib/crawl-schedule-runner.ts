import { and, desc, eq, isNotNull, lte, ne } from 'drizzle-orm'

import { startCrawlProcess } from '@/app/api/crawl/utils'
import { formatFromHeader, getAppSettings } from '@/lib/app-settings'
import { db } from '@/lib/db'
import { companyWebsites, crawlPages, crawlSchedules, crawlSessions } from '@/lib/db/schema'
import { computeNextRunAt, type Frequency } from '@/lib/recurring-ticket-schedule'
import { getGmailSender, sendRawEmail } from '@/lib/ticket-notification-emails'

type ScheduleRow = typeof crawlSchedules.$inferSelect

export function nextRunFor(rule: Pick<ScheduleRow, 'frequency' | 'specificDays' | 'specificDate' | 'intervalDays' | 'timeOfDay' | 'timezone' | 'startDate' | 'endDate'>, after: Date): Date | null {
  return computeNextRunAt(
    {
      frequency: rule.frequency as Frequency,
      specificDays: rule.specificDays,
      specificDate: rule.specificDate,
      intervalDays: rule.intervalDays,
      timeOfDay: rule.timeOfDay,
      timezone: rule.timezone,
      startDate: rule.startDate,
      endDate: rule.endDate ?? null,
    },
    after
  )
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function brokenUrls(sessionId: string): Promise<Map<string, number | null>> {
  const rows = await db
    .select({ url: crawlPages.url, status: crawlPages.status, code: crawlPages.httpStatusCode })
    .from(crawlPages)
    .where(eq(crawlPages.crawlSessionId, sessionId))
  const out = new Map<string, number | null>()
  for (const r of rows) {
    if (r.status === 'broken-page' || r.status === 'failed' || (r.code != null && r.code >= 400)) {
      out.set(r.url.replace(/#.*$/, '').replace(/\/$/, ''), r.code)
    }
  }
  return out
}

/** After a scheduled crawl: pages broken now that were not broken in the previous finished crawl are emailed. */
async function notifyNewBroken(rule: ScheduleRow, sessionId: string): Promise<void> {
  const [finished] = await db.select({ status: crawlSessions.status }).from(crawlSessions).where(eq(crawlSessions.id, sessionId)).limit(1)
  if (finished?.status !== 'completed') return

  const [previous] = await db
    .select({ id: crawlSessions.id })
    .from(crawlSessions)
    .where(and(eq(crawlSessions.companyWebsiteId, rule.companyWebsiteId), eq(crawlSessions.status, 'completed'), ne(crawlSessions.id, sessionId)))
    .orderBy(desc(crawlSessions.createdAt))
    .limit(1)

  const now = await brokenUrls(sessionId)
  const before = previous ? await brokenUrls(previous.id) : new Map<string, number | null>()
  const fresh = [...now].filter(([u]) => !before.has(u))

  await db.update(crawlSchedules).set({ lastNewBroken: fresh.length, updatedAt: new Date() }).where(eq(crawlSchedules.id, rule.id))

  const to = (rule.notifyEmails ?? []).map((e) => e.trim()).filter(Boolean)
  if (fresh.length === 0 || to.length === 0) return

  const [site] = await db.select({ url: companyWebsites.url }).from(companyWebsites).where(eq(companyWebsites.id, rule.companyWebsiteId)).limit(1)
  const [sender, settings] = await Promise.all([getGmailSender(), getAppSettings()])
  if (!sender) {
    console.error('[crawl-schedule] No email integration; cannot send the broken pages notice')
    return
  }
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
  const items = fresh
    .slice(0, 50)
    .map(([u, code]) => `<li>${esc(u)} (${code ?? 'failed'})</li>`)
    .join('')
  const more = fresh.length > 50 ? `<p>and ${fresh.length - 50} more.</p>` : ''
  const html = `<p>The scheduled crawl of <b>${esc(site?.url ?? 'the website')}</b> found ${fresh.length} page(s) that are broken now and were not broken in the previous crawl:</p><ul>${items}</ul>${more}<p><a href="${base}/crawl-sessions/${sessionId}">Open the crawl</a> (Broken Links tab shows which pages link to them).</p>`
  const from = formatFromHeader(settings.email_sender_name, sender.fromEmail)
  for (const addr of to) {
    try {
      await sendRawEmail(sender, addr, `${fresh.length} new broken page(s) on ${site?.url ?? 'website'}`, html, from)
    } catch (e) {
      console.error(`[crawl-schedule] Email to ${addr} failed:`, e)
    }
  }
}

/** Starts every active schedule that is due. The crawls run in the background; this returns once they are started. */
export async function runDueCrawlSchedules(now = new Date()): Promise<{ started: number; failed: number }> {
  const due = await db
    .select()
    .from(crawlSchedules)
    .where(and(eq(crawlSchedules.isActive, true), isNotNull(crawlSchedules.nextRunAt), lte(crawlSchedules.nextRunAt, now)))

  let started = 0
  let failed = 0
  for (const rule of due) {
    // Move the schedule forward first so a slow or failing crawl can never fire twice.
    const next = nextRunFor(rule, now)
    await db
      .update(crawlSchedules)
      .set({ lastRunAt: now, nextRunAt: next, isActive: next ? rule.isActive : false, updatedAt: now })
      .where(eq(crawlSchedules.id, rule.id))
    try {
      const [session] = await db
        .insert(crawlSessions)
        .values({ companyWebsiteId: rule.companyWebsiteId, status: 'crawling', maxDepth: rule.maxDepth, maxPages: rule.maxPages, startedAt: now })
        .returning({ id: crawlSessions.id })
      if (!session) throw new Error('Failed to create crawl session')
      await db.update(crawlSchedules).set({ lastSessionId: session.id }).where(eq(crawlSchedules.id, rule.id))
      void startCrawlProcess(db, session.id, rule.companyWebsiteId, rule.maxDepth, rule.maxPages)
        .then(() => notifyNewBroken(rule, session.id))
        .catch((e) => console.error(`[crawl-schedule] Crawl ${session.id} failed:`, e))
      started++
    } catch (e) {
      failed++
      console.error(`[crawl-schedule] Could not start schedule ${rule.id}:`, e)
    }
  }
  return { started, failed }
}
