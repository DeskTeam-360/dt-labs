import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { companies, companyPics, db, tickets, users, wpSiteAlarms, wpSites } from '@/lib/db'
import { escapeHtml, sendHtmlEmail, siteUrl } from '@/lib/plain-email'
import { ACTIVE_WORKLOAD_STATUSES } from '@/lib/skills'

type Row = { id: number; title: string; status: string; dueDate: Date | null; updatedAt: Date; companyId: string | null; assigned: boolean }

const LIST_LIMIT = 15
const DAY_MS = 86400000

const when = (d: Date | null) => (d ? new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10) : '-')

/**
 * The morning email to each PIC: tickets of the companies they are in charge of that are overdue, that nobody holds,
 * or that nobody touched for `staleDays`. Nothing is sent to a PIC with nothing to report. Returns who got an email.
 */
export async function sendPicDigests(opts: { staleDays?: number; dryRun?: boolean } = {}): Promise<{ pics: number; sent: number; skipped: number; preview?: { email: string; overdue: number; unassigned: number; stale: number }[] }> {
  const staleDays = Math.max(1, Math.min(60, opts.staleDays ?? 3))
  const now = new Date()
  const staleBefore = new Date(now.getTime() - staleDays * DAY_MS)

  const links = await db
    .select({ userId: companyPics.userId, companyId: companyPics.companyId, role: companyPics.role, email: users.email, name: users.fullName, status: users.status })
    .from(companyPics)
    .innerJoin(users, eq(companyPics.userId, users.id))
  const people = new Map<string, { email: string; name: string; companyIds: string[] }>()
  for (const l of links) {
    if (!l.email || (l.status && l.status !== 'active')) continue
    const p = people.get(l.userId) ?? { email: l.email, name: l.name || l.email, companyIds: [] }
    p.companyIds.push(l.companyId)
    people.set(l.userId, p)
  }
  if (people.size === 0) return { pics: 0, sent: 0, skipped: 0 }

  const allCompanyIds = [...new Set([...people.values()].flatMap((p) => p.companyIds))]
  const [companyRows, ticketRows] = await Promise.all([
    db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, allCompanyIds)),
    db
      .select({
        id: tickets.id,
        title: tickets.title,
        status: tickets.status,
        dueDate: tickets.dueDate,
        updatedAt: tickets.updatedAt,
        companyId: tickets.companyId,
        assigned: sql<boolean>`EXISTS (SELECT 1 FROM ticket_assignees ta WHERE ta.ticket_id = ${tickets.id})`,
      })
      .from(tickets)
      .where(and(eq(tickets.ticketType, 'support'), inArray(tickets.status, ACTIVE_WORKLOAD_STATUSES), inArray(tickets.companyId, allCompanyIds))),
  ])
  const nameOf = new Map(companyRows.map((c) => [c.id, c.name]))

  // WordPress sites of these companies with an open alarm, so a PIC hears about them in the same morning email.
  const wpRows = await db
    .select({ companyId: wpSites.companyId, site: wpSites.name, url: wpSites.siteUrl, level: wpSiteAlarms.level, message: wpSiteAlarms.message })
    .from(wpSiteAlarms)
    .innerJoin(wpSites, eq(wpSiteAlarms.siteId, wpSites.id))
    .where(and(isNull(wpSiteAlarms.clearedAt), inArray(wpSites.companyId, allCompanyIds)))
  const wpByCompany = new Map<string, typeof wpRows>()
  for (const w of wpRows) wpByCompany.set(w.companyId as string, [...(wpByCompany.get(w.companyId as string) ?? []), w])
  const byCompany = new Map<string, Row[]>()
  for (const t of ticketRows as Row[]) byCompany.set(t.companyId as string, [...(byCompany.get(t.companyId as string) ?? []), t])

  let sent = 0
  let skipped = 0
  const preview: { email: string; overdue: number; unassigned: number; stale: number; wp: number }[] = []
  for (const p of people.values()) {
    const mine = p.companyIds.flatMap((c) => byCompany.get(c) ?? [])
    const overdue = mine.filter((t) => t.dueDate && t.dueDate < now).sort((a, b) => (a.dueDate as Date).getTime() - (b.dueDate as Date).getTime())
    const unassigned = mine.filter((t) => !t.assigned)
    const stale = mine.filter((t) => t.updatedAt < staleBefore).sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    const wp = p.companyIds.flatMap((c) => wpByCompany.get(c) ?? []).sort((a, b) => Number(b.level === 'red') - Number(a.level === 'red'))
    preview.push({ email: p.email, overdue: overdue.length, unassigned: unassigned.length, stale: stale.length, wp: wp.length })
    if (overdue.length + unassigned.length + stale.length + wp.length === 0) {
      skipped++
      continue
    }
    if (opts.dryRun) continue

    const section = (title: string, rows: Row[], extra: (t: Row) => string) =>
      rows.length === 0
        ? ''
        : `<h3 style="margin:16px 0 4px">${title} (${rows.length})</h3><ul style="margin:0;padding-left:18px">${rows
            .slice(0, LIST_LIMIT)
            .map((t) => `<li><a href="${siteUrl()}/tickets/${t.id}">#${t.id}</a> ${escapeHtml(t.title)} <span style="color:#888">- ${escapeHtml(nameOf.get(t.companyId as string) ?? '')}${extra(t)}</span></li>`)
            .join('')}</ul>${rows.length > LIST_LIMIT ? `<p style="color:#888">...and ${rows.length - LIST_LIMIT} more.</p>` : ''}`
    const html =
      `<p>Hello ${escapeHtml(p.name)}, here is what needs a look in the companies you are in charge of.</p>` +
      section('Overdue', overdue, (t) => `, due ${when(t.dueDate)}`) +
      section('Nobody is assigned', unassigned, () => '') +
      section(`No update for ${staleDays}+ days`, stale, (t) => `, last update ${when(t.updatedAt)}`) +
      (wp.length === 0
        ? ''
        : `<h3 style="margin:16px 0 4px">WordPress sites needing attention (${wp.length})</h3><ul style="margin:0;padding-left:18px">${wp
            .slice(0, LIST_LIMIT)
            .map((w) => `<li><strong>${escapeHtml(w.site || w.url)}</strong>: ${escapeHtml(w.message)} <span style="color:#888">(${w.level === 'red' ? 'needs action' : 'check'})</span></li>`)
            .join('')}</ul><p style="margin:4px 0 0"><a href="${siteUrl()}/wp-monitor">Open WordPress monitoring</a></p>`) +
      `<p style="margin-top:16px"><a href="${siteUrl()}/tickets">Open tickets</a></p>`
    if (await sendHtmlEmail(p.email, `Your companies today: ${overdue.length} overdue, ${unassigned.length} unassigned, ${stale.length} stale${wp.length ? `, ${wp.length} WordPress alert${wp.length === 1 ? '' : 's'}` : ''}`, html)) sent++
  }
  return { pics: people.size, sent, skipped, ...(opts.dryRun ? { preview } : {}) }
}

