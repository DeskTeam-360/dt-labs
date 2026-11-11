import { and, eq, inArray, isNull } from 'drizzle-orm'

import { companies, companyPics, db, users, wpSiteAlarms, wpSites } from '@/lib/db'
import { escapeHtml, sendHtmlEmail, siteUrl } from '@/lib/plain-email'
import { evaluateWpSite } from '@/lib/wp-health'
import { loadWpSeries, type WpPoint } from '@/lib/wp-series'

export type DesiredAlarm = { code: string; level: 'red' | 'yellow'; message: string }

type SiteRow = typeof wpSites.$inferSelect

const DAY_MS = 86400000
const SPIKE_FACTOR = 3
const MIN_SPAM_SPIKE = 10
const MIN_FORMS_SPIKE = 5

/** The last point at or before a moment, or null. */
const pointAtOrBefore = (series: WpPoint[], ms: number) => [...series].reverse().find((p) => new Date(p.at).getTime() <= ms) ?? null

/**
 * Everything wrong with a site right now: what its latest report says, what this server's own check says,
 * and the two things only a comparison with earlier reports shows (a new administrator, a jump in spam or form entries).
 */
export function desiredAlarms(site: SiteRow, series: WpPoint[], now: Date = new Date()): DesiredAlarm[] {
  const out: DesiredAlarm[] = []
  const report = site.lastReport as Record<string, unknown> | null
  const { problems } = evaluateWpSite(site.lastSeenAt, report, now)
  for (const p of problems) if (p.level !== 'info') out.push({ code: p.code, level: p.level, message: p.text })

  // This server's own check: two failed checks in a row, so one slow answer is not an outage.
  if (site.uptimeFailCount >= 2) {
    const since = site.uptimeDownSince ? new Date(site.uptimeDownSince).toISOString().slice(0, 16).replace('T', ' ') : null
    out.push({ code: 'site_down', level: 'red', message: `The site does not answer${site.uptimeStatus ? ` (HTTP ${site.uptimeStatus})` : ''}${since ? ` since ${since} UTC` : ''}` })
  }

  if (series.length >= 2) {
    const latest = series[series.length - 1]

    // A new administrator: one that was not in the oldest report of the last 8 days. It stays flagged for those days.
    const weekAgo = series.find((p) => new Date(p.at).getTime() >= now.getTime() - 8 * DAY_MS)
    if (weekAgo && weekAgo !== latest && weekAgo.admin_ids.length > 0) {
      const fresh = latest.admin_ids.filter((id) => !weekAgo.admin_ids.includes(id))
      if (fresh.length > 0) {
        const admins = ((report?.users as { administrators?: { id: number; login: string }[] } | undefined)?.administrators ?? []).filter((a) => fresh.includes(a.id))
        out.push({ code: 'new_admin', level: 'red', message: `New administrator account${admins.length === 1 ? '' : 's'}: ${admins.map((a) => a.login).join(', ') || fresh.join(', ')}` })
      }
    }

    // Spam that grew in the last day far more than usual.
    const t = new Date(latest.at).getTime()
    const dayAgo = pointAtOrBefore(series, t - DAY_MS)
    if (dayAgo && latest.spam !== null && dayAgo.spam !== null) {
      const inc = Math.max(0, latest.spam - dayAgo.spam)
      const daily: number[] = []
      for (let d = 2; d <= 7; d++) {
        const a = pointAtOrBefore(series, t - (d - 1) * DAY_MS)
        const b = pointAtOrBefore(series, t - d * DAY_MS)
        if (a?.spam != null && b?.spam != null) daily.push(Math.max(0, a.spam - b.spam))
      }
      const avg = daily.length ? daily.reduce((s, n) => s + n, 0) / daily.length : 0
      if (daily.length >= 2 && inc > Math.max(MIN_SPAM_SPIKE, SPIKE_FACTOR * avg)) {
        out.push({ code: 'spam_spike', level: 'yellow', message: `${inc} new spam comments in a day (usually about ${Math.round(avg)})` })
      }
    }

    // Form entries in the last 24 hours far above the week's average.
    const before = series.filter((p) => new Date(p.at).getTime() < t - DAY_MS && p.forms_24h !== null)
    if (latest.forms_24h !== null && before.length >= 24) {
      const avg = before.reduce((s, p) => s + (p.forms_24h ?? 0), 0) / before.length
      if (latest.forms_24h > Math.max(MIN_FORMS_SPIKE, SPIKE_FACTOR * avg)) {
        out.push({ code: 'forms_spike', level: 'yellow', message: `${latest.forms_24h} form entries in 24 hours (usually about ${Math.round(avg)})` })
      }
    }
  }
  return out
}

/** The people to tell about a site: the PICs of its company, or the admins when it has none. */
async function recipientsFor(site: SiteRow): Promise<string[]> {
  if (site.companyId) {
    const pics = await db
      .select({ email: users.email, status: users.status })
      .from(companyPics)
      .innerJoin(users, eq(companyPics.userId, users.id))
      .where(eq(companyPics.companyId, site.companyId))
    const emails = pics.filter((p) => p.email && (!p.status || p.status === 'active')).map((p) => p.email)
    if (emails.length) return emails
  }
  const admins = await db.select({ email: users.email, status: users.status }).from(users).where(eq(users.role, 'admin'))
  return admins.filter((a) => a.email && (!a.status || a.status === 'active')).map((a) => a.email)
}

async function notifyRed(site: SiteRow, alarms: { message: string }[]) {
  const [company] = site.companyId ? await db.select({ name: companies.name }).from(companies).where(eq(companies.id, site.companyId)).limit(1) : []
  const label = site.name || site.siteUrl
  const subject = `${label}: ${alarms.length === 1 ? alarms[0].message : `${alarms.length} problems need action`}`
  const html =
    `<p><strong>${escapeHtml(label)}</strong>${company ? ` (${escapeHtml(company.name)})` : ''} needs action:</p>` +
    `<ul>${alarms.map((a) => `<li>${escapeHtml(a.message)}</li>`).join('')}</ul>` +
    `<p><a href="${escapeHtml(site.siteUrl)}">${escapeHtml(site.siteUrl)}</a> · <a href="${siteUrl()}/wp-monitor">Open WordPress monitoring</a></p>`
  for (const to of await recipientsFor(site)) await sendHtmlEmail(to, subject, html)
}

/**
 * Brings a site's alarms in line with its situation: a new problem opens an alarm, a problem that is gone clears it,
 * one that is still there is left alone (never repeated). Red alarms are emailed once, unless the site is snoozed;
 * an alarm that opened during a snooze is emailed when the snooze ends if it is still open.
 */
export async function syncSiteAlarms(site: SiteRow, now: Date = new Date()): Promise<{ opened: number; cleared: number }> {
  const series = await loadWpSeries(site.id, 8)
  const wanted = desiredAlarms(site, series, now)
  const open = await db.select().from(wpSiteAlarms).where(and(eq(wpSiteAlarms.siteId, site.id), isNull(wpSiteAlarms.clearedAt)))

  const wantedCodes = new Set(wanted.map((w) => w.code))
  const gone = open.filter((o) => !wantedCodes.has(o.code)).map((o) => o.id)
  if (gone.length) await db.update(wpSiteAlarms).set({ clearedAt: now }).where(inArray(wpSiteAlarms.id, gone))

  const openCodes = new Set(open.map((o) => o.code))
  const fresh = wanted.filter((w) => !openCodes.has(w.code))
  for (const w of fresh) {
    await db.insert(wpSiteAlarms).values({ siteId: site.id, code: w.code, level: w.level, message: w.message, openedAt: now }).onConflictDoNothing()
  }
  // The text of an alarm that is still open follows the latest numbers.
  for (const o of open) {
    const w = wanted.find((x) => x.code === o.code)
    if (w && (w.message !== o.message || w.level !== o.level)) await db.update(wpSiteAlarms).set({ message: w.message, level: w.level }).where(eq(wpSiteAlarms.id, o.id))
  }

  const snoozed = site.snoozedUntil && new Date(site.snoozedUntil) > now
  if (!snoozed) {
    const toTell = await db
      .select()
      .from(wpSiteAlarms)
      .where(and(eq(wpSiteAlarms.siteId, site.id), isNull(wpSiteAlarms.clearedAt), isNull(wpSiteAlarms.notifiedAt), eq(wpSiteAlarms.level, 'red')))
    if (toTell.length) {
      await notifyRed(site, toTell)
      await db.update(wpSiteAlarms).set({ notifiedAt: now }).where(inArray(wpSiteAlarms.id, toTell.map((a) => a.id)))
    }
  }
  return { opened: fresh.length, cleared: gone.length }
}
