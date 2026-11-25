import { desc, eq, type SQL } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, maintenanceReports } from '@/lib/db'
import { createMaintenanceReport } from '@/lib/maintenance-report'

export const dynamic = 'force-dynamic'

async function staff() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (((session.user as { role?: string }).role ?? '').toLowerCase() === 'customer') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

/** GET /api/maintenance-reports?website_id=...|company_id=... - the history of reports, newest first (staff). */
export async function GET(request: Request) {
  const s = await staff()
  if (s.error) return s.error
  const q = new URL(request.url).searchParams
  const websiteId = q.get('website_id')
  const companyId = q.get('company_id')
  if (!websiteId && !companyId) return NextResponse.json({ error: 'website_id or company_id is required' }, { status: 400 })
  const where: SQL = websiteId ? eq(maintenanceReports.websiteId, websiteId) : eq(maintenanceReports.companyId, companyId as string)
  const rows = await db.select().from(maintenanceReports).where(where).orderBy(desc(maintenanceReports.periodDate), desc(maintenanceReports.createdAt)).limit(200)
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      website_id: r.websiteId,
      template_key: r.templateKey,
      template_name: r.templateName,
      period_date: r.periodDate,
      status: r.status,
      shared: !!r.shareToken,
      created_at: r.createdAt?.toISOString() ?? '',
    })),
  })
}

/** POST /api/maintenance-reports { website_id, template: the template key, for example 'weekly' } - starts a report and fills what the system can. */
export async function POST(request: Request) {
  const s = await staff()
  if (s.error) return s.error
  const b = (await request.json().catch(() => ({}))) as { website_id?: unknown; template?: unknown }
  const websiteId = String(b.website_id ?? '')
  const template = String(b.template ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(websiteId)) return NextResponse.json({ error: 'Invalid website' }, { status: 400 })
  if (!/^[a-z0-9-]{1,30}$/.test(template)) return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
  const res = await createMaintenanceReport({ websiteId, templateKey: template, userId: s.userId as string })
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 404 })
  return NextResponse.json({ ok: true, id: res.report.id })
}
