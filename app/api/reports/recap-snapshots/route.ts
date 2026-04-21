import { count, desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdminOrManager } from '@/lib/auth-utils'
import { db, recapSnapshots, users } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role
}

/** GET — list saved recap snapshots (newest first), admin/manager only. */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdminOrManager(sessionRole(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0)
  const includePayload = url.searchParams.get('include_payload') === '1'

  const [agg] = await db.select({ n: count() }).from(recapSnapshots)
  const totalCount = Number(agg?.n ?? 0)

  const baseSelect = {
    id: recapSnapshots.id,
    title: recapSnapshots.title,
    periodStart: recapSnapshots.periodStart,
    periodEnd: recapSnapshots.periodEnd,
    periodType: recapSnapshots.periodType,
    teamIds: recapSnapshots.teamIds,
    createdAt: recapSnapshots.createdAt,
    updatedAt: recapSnapshots.updatedAt,
    createdBy: recapSnapshots.createdBy,
    creatorEmail: users.email,
    creatorFullName: users.fullName,
  }

  const rows = includePayload
    ? await db
        .select({ ...baseSelect, payload: recapSnapshots.payload })
        .from(recapSnapshots)
        .leftJoin(users, eq(recapSnapshots.createdBy, users.id))
        .orderBy(desc(recapSnapshots.createdAt))
        .limit(limit)
        .offset(offset)
    : await db
        .select(baseSelect)
        .from(recapSnapshots)
        .leftJoin(users, eq(recapSnapshots.createdBy, users.id))
        .orderBy(desc(recapSnapshots.createdAt))
        .limit(limit)
        .offset(offset)

  return NextResponse.json({
    data: rows,
    total: totalCount,
    limit,
    offset,
  })
}
