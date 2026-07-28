import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** POST — set active_time = 0 for all existing Saturday/Sunday rows in company_daily_active_assignments. */
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((sessionRole(session) ?? '').toLowerCase() !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // EXTRACT(DOW FROM date): 0 = Sunday, 6 = Saturday (PostgreSQL)
  const result = await db.execute(sql`
    UPDATE company_daily_active_assignments
    SET active_time = 0
    WHERE EXTRACT(DOW FROM snapshot_date::date) IN (0, 6)
      AND active_time != 0
  `)

  const rows = typeof result.count === 'number' ? result.count : null
  return NextResponse.json({ ok: true, rows_updated: rows })
}
