import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import {
  getJobTypesCatalogDiagnostics,
  recreateJobTypesCatalogTable,
  repairJobTypesPublicGrants,
} from '@/lib/job-types-catalog-maintenance'

/** GET — current diagnostics only */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const diagnostics = await getJobTypesCatalogDiagnostics()
    return NextResponse.json({ diagnostics })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Diagnostics failed' },
      { status: 500 }
    )
  }
}

/**
 * POST body: { action: 'repair_permissions' | 'recreate_catalog' }
 * Admin-only. recreate_catalog DROPs job_types CASCADE (destructive).
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let action: unknown
  try {
    const body = await request.json()
    action = body?.action
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (action !== 'repair_permissions' && action !== 'recreate_catalog') {
    return NextResponse.json(
      { error: 'action must be repair_permissions or recreate_catalog' },
      { status: 400 }
    )
  }

  try {
    if (action === 'repair_permissions') {
      const res = await repairJobTypesPublicGrants()
      const diagnostics = await getJobTypesCatalogDiagnostics()
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: res.error, diagnostics }, { status: 422 })
      }
      return NextResponse.json({ ok: true, diagnostics })
    }

    const res = await recreateJobTypesCatalogTable()
    const diagnostics = await getJobTypesCatalogDiagnostics()
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error, diagnostics }, { status: 422 })
    }
    return NextResponse.json({ ok: true, diagnostics })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Operation failed' },
      { status: 500 }
    )
  }
}
