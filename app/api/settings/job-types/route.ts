import { asc, max } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { db, jobTypes } from '@/lib/db'
import {
  normalizeJobTypeSlug,
  normalizeJobTypeTitle,
  parseJobTypeSortOrder,
} from '@/lib/job-types-admin'

function assertAdmin(role: string | undefined) {
  if (!isAdmin(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

function serializeRow(r: typeof jobTypes.$inferSelect) {
  return {
    slug: r.slug,
    title: r.title,
    sort_order: r.sortOrder,
    is_active: r.isActive,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  }
}

/** GET — all job types (admin), including inactive */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  const forbid = assertAdmin(role)
  if (forbid) return forbid

  const rows = await db
    .select({
      slug: jobTypes.slug,
      title: jobTypes.title,
      sortOrder: jobTypes.sortOrder,
      isActive: jobTypes.isActive,
      createdAt: jobTypes.createdAt,
    })
    .from(jobTypes)
    .orderBy(asc(jobTypes.sortOrder), asc(jobTypes.slug))

  return NextResponse.json(rows.map((r) => serializeRow(r as typeof jobTypes.$inferSelect)))
}

/** POST — create job type */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const role = (session.user as { role?: string }).role
  const forbid = assertAdmin(role)
  if (forbid) return forbid

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const slug = normalizeJobTypeSlug(body.slug)
  const title = normalizeJobTypeTitle(body.title)
  if (!slug || !title) {
    return NextResponse.json(
      { error: 'Invalid slug (use a–z, 0–9, underscore, max 64) or missing title' },
      { status: 400 }
    )
  }

  const [{ mxRaw }] = await db.select({ mxRaw: max(jobTypes.sortOrder) }).from(jobTypes)
  const mx = mxRaw !== null && mxRaw !== undefined ? Number(mxRaw) : 0
  const sortFallback = Number.isFinite(mx) ? mx + 1 : 1
  const sortOrder = parseJobTypeSortOrder(body.sort_order, sortFallback)
  const isActive =
    body.is_active === undefined || body.is_active === null ? true : Boolean(body.is_active)

  try {
    const [row] = await db
      .insert(jobTypes)
      .values({
        slug,
        title,
        sortOrder,
        isActive,
      })
      .returning()

    return NextResponse.json(serializeRow(row))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Slug already exists' }, { status: 409 })
    }
    console.error('[POST /api/settings/job-types]', e)
    return NextResponse.json({ error: 'Could not create job type' }, { status: 500 })
  }
}
