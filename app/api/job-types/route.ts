import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, jobTypes } from '@/lib/db'

/** GET /api/job-types — active job types for time tracker selects (ordered). */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({
      slug: jobTypes.slug,
      title: jobTypes.title,
      sort_order: jobTypes.sortOrder,
    })
    .from(jobTypes)
    .where(eq(jobTypes.isActive, true))
    .orderBy(asc(jobTypes.sortOrder), asc(jobTypes.slug))

  return NextResponse.json(
    rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      sort_order: r.sort_order,
    }))
  )
}
