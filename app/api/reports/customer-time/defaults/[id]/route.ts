import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import {
  normalizeGlobalFilters,
  normalizePresetTitle,
  type CustomerTimeReportGlobalFilters,
} from '@/lib/customer-time-report-defaults'
import { db, customerTimeReportDefaults } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

function parseId(raw: string): number | null {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** PATCH — update one preset by id. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: idParam } = await params
  const id = parseId(idParam)
  if (id == null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
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
    const [updated] = await db
      .update(customerTimeReportDefaults)
      .set({
        title,
        filters,
        updatedAt: new Date(),
        updatedBy: userId ?? null,
      })
      .where(eq(customerTimeReportDefaults.id, id))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: updated.id,
      title: normalizePresetTitle(updated.title),
      filters,
      updated_at: updated.updatedAt ? updated.updatedAt.toISOString() : null,
      updated_by: updated.updatedBy,
    })
  } catch (e) {
    console.error('[customer-time defaults PATCH id]', e)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}

/** DELETE — remove one preset. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: idParam } = await params
  const id = parseId(idParam)
  if (id == null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  try {
    const [removed] = await db
      .delete(customerTimeReportDefaults)
      .where(eq(customerTimeReportDefaults.id, id))
      .returning()

    if (!removed) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, id: removed.id })
  } catch (e) {
    console.error('[customer-time defaults DELETE id]', e)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
