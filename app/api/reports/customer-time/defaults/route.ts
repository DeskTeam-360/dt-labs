import { desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import {
  type CustomerTimeReportGlobalFilters,
  normalizeGlobalFilters,
  normalizePresetTitle,
} from '@/lib/customer-time-report-defaults'
import { customerTimeReportDefaults,db } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET — list all saved presets (newest first). */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const rows = await db
      .select()
      .from(customerTimeReportDefaults)
      .orderBy(desc(customerTimeReportDefaults.updatedAt))

    const presets = rows.map((row) => ({
      id: row.id,
      title: normalizePresetTitle(row.title),
      filters: normalizeGlobalFilters(row.filters),
      updated_at: row.updatedAt ? row.updatedAt.toISOString() : null,
      updated_by: row.updatedBy,
    }))

    return NextResponse.json({ presets })
  } catch (e) {
    console.error('[customer-time defaults GET]', e)
    return NextResponse.json(
      {
        error:
          'Database error. Run migrations under drizzle/migrations for customer_time_report_defaults if the table is missing.',
      },
      { status: 500 }
    )
  }
}

/** POST — create a new preset (does not replace existing rows). */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const bodyObj = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  const title = normalizePresetTitle(bodyObj?.title)

  const parsed = normalizeGlobalFilters(
    bodyObj ? (bodyObj.filters !== undefined ? bodyObj.filters : body) : body
  )

  if (parsed.company_ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one company to save' }, { status: 400 })
  }

  const filters: CustomerTimeReportGlobalFilters = {
    company_ids: parsed.company_ids,
    start: parsed.start,
    end: parsed.end,
    date_preset: parsed.date_preset,
    status_slugs: parsed.status_slugs?.length ? parsed.status_slugs : null,
    urgent_only: parsed.urgent_only,
  }

  const userId = (session.user as { id?: string }).id

  try {
    const [inserted] = await db
      .insert(customerTimeReportDefaults)
      .values({
        title,
        filters,
        updatedAt: new Date(),
        updatedBy: userId ?? null,
      })
      .returning()

    if (!inserted) {
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    }

    return NextResponse.json({
      id: inserted.id,
      title: normalizePresetTitle(inserted.title),
      filters,
      updated_at: inserted.updatedAt ? inserted.updatedAt.toISOString() : null,
      updated_by: inserted.updatedBy,
    })
  } catch (e) {
    console.error('[customer-time defaults POST]', e)
    return NextResponse.json(
      {
        error:
          'Database error. If saves still replace one row, run drizzle/migrations/023_customer_time_report_defaults_multi_preset.sql.',
      },
      { status: 500 }
    )
  }
}
