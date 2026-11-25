import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, maintenanceReportItems, maintenanceReports } from '@/lib/db'
import { fillAutoItems, loadMaintenanceReport, newShareToken } from '@/lib/maintenance-report'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function staff(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (((session.user as { role?: string }).role ?? '').toLowerCase() === 'customer') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: NextResponse.json({ error: 'Invalid report' }, { status: 400 }) }
  return { userId: session.user.id }
}

const out = (d: NonNullable<Awaited<ReturnType<typeof loadMaintenanceReport>>>) => ({
  report: {
    id: d.report.id,
    website_id: d.report.websiteId,
    template_name: d.report.templateName,
    template_key: d.report.templateKey,
    period_date: d.report.periodDate,
    status: d.report.status,
    conclusion: d.report.conclusion ?? '',
    share_token: d.report.shareToken,
  },
  header: d.header,
  branding: d.branding,
  items: d.items.map((i) => ({
    id: i.id,
    section: i.section,
    label: i.label,
    options: i.options,
    source: i.source,
    status: i.status,
    note: i.note ?? '',
    link_url: i.linkUrl ?? '',
    checked_on: i.checkedOn,
    auto_filled: i.autoFilled,
    edited: i.edited,
  })),
})

/** GET /api/maintenance-reports/{id} - the report with its header facts and items (staff). */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const s = await staff(id)
  if (s.error) return s.error
  const d = await loadMaintenanceReport(id)
  if (!d) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  return NextResponse.json(out(d))
}

/**
 * PATCH /api/maintenance-reports/{id}
 * { items?: [{ id, status?, note?, link_url? }], conclusion?, status?: 'draft' | 'final', action?: 'refresh' | 'share' | 'unshare' }
 * refresh = run the automatic checks again (items a person changed are left alone).
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const s = await staff(id)
  if (s.error) return s.error
  const [report] = await db.select().from(maintenanceReports).where(eq(maintenanceReports.id, id)).limit(1)
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  const b = (await request.json().catch(() => ({}))) as {
    items?: { id?: unknown; status?: unknown; note?: unknown; link_url?: unknown }[]
    conclusion?: unknown
    status?: unknown
    action?: unknown
    add_item?: { section?: unknown; label?: unknown; options?: unknown }
    delete_item?: unknown
  }
  const today = new Date().toISOString().slice(0, 10)

  if (Array.isArray(b.items) && b.items.length > 0) {
    const ids = b.items.map((i) => String(i.id ?? '')).filter((x) => /^[0-9a-f-]{36}$/i.test(x))
    const own = new Set(
      (await db.select({ id: maintenanceReportItems.id, reportId: maintenanceReportItems.reportId }).from(maintenanceReportItems).where(inArray(maintenanceReportItems.id, ids)))
        .filter((r) => r.reportId === id)
        .map((r) => r.id)
    )
    for (const i of b.items) {
      const itemId = String(i.id ?? '')
      if (!own.has(itemId)) continue
      const set: Partial<typeof maintenanceReportItems.$inferInsert> = { edited: true, developerId: s.userId, checkedOn: today }
      if (i.status !== undefined) set.status = i.status === null || i.status === '' ? null : String(i.status).slice(0, 200)
      if (i.note !== undefined) set.note = String(i.note ?? '').slice(0, 5000) || null
      if (i.link_url !== undefined) set.linkUrl = String(i.link_url ?? '').slice(0, 2000) || null
      await db.update(maintenanceReportItems).set(set).where(eq(maintenanceReportItems.id, itemId))
    }
  }

  // An item only this report has (or one taken off it), while it is still a draft.
  if ((b.add_item || b.delete_item) && report.status === 'final') return NextResponse.json({ error: 'Reopen the report to change its items' }, { status: 400 })
  if (b.add_item) {
    const section = String(b.add_item.section ?? '').trim().slice(0, 100)
    const label = String(b.add_item.label ?? '').trim().slice(0, 300)
    if (!section || !label) return NextResponse.json({ error: 'An item needs a section and a name' }, { status: 400 })
    const options = (Array.isArray(b.add_item.options) ? b.add_item.options : []).map((o) => String(o).trim().slice(0, 100)).filter(Boolean).slice(0, 8)
    const rows = await db.select({ pos: maintenanceReportItems.pos, section: maintenanceReportItems.section }).from(maintenanceReportItems).where(eq(maintenanceReportItems.reportId, id))
    const sameSection = rows.filter((r) => r.section === section).map((r) => r.pos)
    const after = sameSection.length ? Math.max(...sameSection) : Math.max(0, ...rows.map((r) => r.pos))
    await db.update(maintenanceReportItems).set({ pos: sql`${maintenanceReportItems.pos} + 1` }).where(and(eq(maintenanceReportItems.reportId, id), gt(maintenanceReportItems.pos, after)))
    await db.insert(maintenanceReportItems).values({ reportId: id, pos: after + 1, section, label, options: options.length ? options : ['Done'], source: null })
  }
  if (b.delete_item && /^[0-9a-f-]{36}$/i.test(String(b.delete_item))) {
    await db.delete(maintenanceReportItems).where(and(eq(maintenanceReportItems.id, String(b.delete_item)), eq(maintenanceReportItems.reportId, id)))
  }

  const set: Partial<typeof maintenanceReports.$inferInsert> = {}
  if (b.conclusion !== undefined) set.conclusion = String(b.conclusion ?? '').slice(0, 20000) || null
  if (b.status === 'final') {
    set.status = 'final'
    set.finalizedAt = new Date()
  } else if (b.status === 'draft') {
    set.status = 'draft'
    set.finalizedAt = null
  }
  // Sharing makes a new hash each time, so an old link stops working.
  if (b.action === 'share') {
    // Only a finished report is shared, so a customer never opens a half-filled one.
    if (report.status !== 'final' && b.status !== 'final') return NextResponse.json({ error: 'Mark the report as final before sharing it' }, { status: 400 })
    set.shareToken = newShareToken()
  }
  if (b.action === 'unshare') set.shareToken = null
  if (Object.keys(set).length > 0) await db.update(maintenanceReports).set(set).where(eq(maintenanceReports.id, id))

  if (b.action === 'refresh') await fillAutoItems(id)

  const d = await loadMaintenanceReport(id)
  return NextResponse.json(d ? out(d) : { ok: true })
}

/** DELETE /api/maintenance-reports/{id} - removes a draft report (a final one stays as history). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const s = await staff(id)
  if (s.error) return s.error
  const [report] = await db.select({ status: maintenanceReports.status }).from(maintenanceReports).where(eq(maintenanceReports.id, id)).limit(1)
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  if (report.status === 'final') return NextResponse.json({ error: 'A final report cannot be deleted' }, { status: 400 })
  await db.delete(maintenanceReports).where(eq(maintenanceReports.id, id))
  return NextResponse.json({ ok: true })
}
