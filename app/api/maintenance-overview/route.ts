import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, companyWebsites, crawlSchedules, crawlSessions, db, maintenanceReports } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Days after which a report of this kind is due again. */
const CYCLE_DAYS: Record<string, number> = { weekly: 7, monthly: 31 }
const DAY = 86400000

/** GET /api/maintenance-overview - every website with its last report, last finished crawl and schedule, and whether maintenance is due (staff). */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (((session.user as { role?: string }).role ?? '').toLowerCase() === 'customer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [sites, reports, crawls, schedules] = await Promise.all([
    db.select({ id: companyWebsites.id, url: companyWebsites.url, companyId: companyWebsites.companyId, company: companies.name }).from(companyWebsites).leftJoin(companies, eq(companyWebsites.companyId, companies.id)),
    db.select().from(maintenanceReports).orderBy(desc(maintenanceReports.periodDate), desc(maintenanceReports.createdAt)),
    db.select({ websiteId: crawlSessions.companyWebsiteId, createdAt: crawlSessions.createdAt }).from(crawlSessions).where(eq(crawlSessions.status, 'completed')).orderBy(desc(crawlSessions.createdAt)),
    db.select().from(crawlSchedules).where(eq(crawlSchedules.isActive, true)),
  ])

  const lastReport = new Map<string, (typeof reports)[number]>()
  const draftReport = new Map<string, (typeof reports)[number]>()
  for (const r of reports) {
    if (!lastReport.has(r.websiteId) && r.status === 'final') lastReport.set(r.websiteId, r)
    if (!draftReport.has(r.websiteId) && r.status !== 'final') draftReport.set(r.websiteId, r)
  }
  const lastCrawl = new Map<string, Date>()
  for (const c of crawls) if (c.websiteId && c.createdAt && !lastCrawl.has(c.websiteId)) lastCrawl.set(c.websiteId, new Date(c.createdAt))
  const schedule = new Map<string, (typeof schedules)[number]>()
  for (const s of schedules) {
    const cur = schedule.get(s.companyWebsiteId)
    if (!cur || (s.maintenanceTemplateKey && !cur.maintenanceTemplateKey)) schedule.set(s.companyWebsiteId, s)
  }

  const now = Date.now()
  const data = sites.map((w) => {
    const rep = lastReport.get(w.id)
    const draft = draftReport.get(w.id)
    const sch = schedule.get(w.id)
    const key = sch?.maintenanceTemplateKey ?? rep?.templateKey ?? 'weekly'
    const cycle = CYCLE_DAYS[key] ?? 7
    const repAge = rep ? Math.floor((now - Date.parse(`${rep.periodDate}T00:00:00Z`)) / DAY) : null
    const crawl = lastCrawl.get(w.id)
    const state = !rep ? (draft ? 'draft' : 'never') : repAge !== null && repAge >= cycle ? (draft ? 'draft' : 'due') : 'ok'
    return {
      website_id: w.id,
      company_id: w.companyId,
      company: w.company ?? '',
      url: w.url,
      state,
      cycle_days: cycle,
      last_report: rep ? { id: rep.id, name: rep.templateName, date: rep.periodDate, age_days: repAge } : null,
      draft_report: draft ? { id: draft.id, name: draft.templateName, date: draft.periodDate } : null,
      last_crawl_at: crawl ? crawl.toISOString() : null,
      last_crawl_age_days: crawl ? Math.floor((now - crawl.getTime()) / DAY) : null,
      schedule: sch ? { next_run_at: sch.nextRunAt ? new Date(sch.nextRunAt).toISOString() : null, template_key: sch.maintenanceTemplateKey } : null,
    }
  })
  const order: Record<string, number> = { due: 0, never: 1, draft: 2, ok: 3 }
  data.sort((a, b) => order[a.state] - order[b.state] || a.company.localeCompare(b.company))
  return NextResponse.json({ data })
}
