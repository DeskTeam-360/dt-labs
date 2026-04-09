import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import {
  CUSTOMER_TIME_REPORT_DEFAULTS_ROW_ID,
  normalizeGlobalFilters,
  type CustomerTimeReportGlobalFilters,
} from '@/lib/customer-time-report-defaults'
import { db, customerTimeReportDefaults } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET — load global saved filters (same access as the report). */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const [row] = await db
      .select()
      .from(customerTimeReportDefaults)
      .where(eq(customerTimeReportDefaults.id, CUSTOMER_TIME_REPORT_DEFAULTS_ROW_ID))
      .limit(1)

    if (!row) {
      return NextResponse.json(
        {
          error:
            'Default filters row missing. Run migration drizzle/migrations/018_customer_time_report_defaults.sql.',
        },
        { status: 503 }
      )
    }

    const filters = normalizeGlobalFilters(row.filters)
    return NextResponse.json({
      filters,
      updated_at: row.updatedAt ? row.updatedAt.toISOString() : null,
      updated_by: row.updatedBy,
    })
  } catch (e) {
    console.error('[customer-time defaults GET]', e)
    return NextResponse.json(
      {
        error:
          'Database error. Run migration drizzle/migrations/018_customer_time_report_defaults.sql if the table is missing.',
      },
      { status: 500 }
    )
  }
}

/** PATCH — save global default filters (replaces entire JSON). */
export async function PATCH(request: Request) {
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

  const parsed = normalizeGlobalFilters(
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).filters !== undefined
        ? (body as { filters: unknown }).filters
        : body
      : body
  )

  if (parsed.company_ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one company to save' }, { status: 400 })
  }

  const filters: CustomerTimeReportGlobalFilters = {
    company_ids: parsed.company_ids,
    start: parsed.start,
    end: parsed.end,
    status_slugs: parsed.status_slugs?.length ? parsed.status_slugs : null,
    urgent_only: parsed.urgent_only,
  }

  const userId = (session.user as { id?: string }).id

  try {
    const [updated] = await db
      .update(customerTimeReportDefaults)
      .set({
        filters,
        updatedAt: new Date(),
        updatedBy: userId ?? null,
      })
      .where(eq(customerTimeReportDefaults.id, CUSTOMER_TIME_REPORT_DEFAULTS_ROW_ID))
      .returning()

    if (!updated) {
      return NextResponse.json(
        {
          error:
            'Default filters row missing. Run migration drizzle/migrations/018_customer_time_report_defaults.sql.',
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      filters,
      updated_at: updated.updatedAt ? updated.updatedAt.toISOString() : null,
      updated_by: updated.updatedBy,
    })
  } catch (e) {
    console.error('[customer-time defaults PATCH]', e)
    return NextResponse.json(
      {
        error:
          'Database error. Run migration drizzle/migrations/018_customer_time_report_defaults.sql if the table is missing.',
      },
      { status: 500 }
    )
  }
}
