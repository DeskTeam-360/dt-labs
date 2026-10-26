import { desc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companies, db, userCompanyChanges, users } from '@/lib/db'

/** GET /api/users/[id]/company-history -> newest first (admin, manager, staff). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'manager', 'staff'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db
    .select()
    .from(userCompanyChanges)
    .where(eq(userCompanyChanges.userId, (await params).id))
    .orderBy(desc(userCompanyChanges.createdAt))
    .limit(100)

  const companyIds = [...new Set(rows.flatMap((r) => [r.fromCompanyId, r.toCompanyId]).filter((v): v is string => Boolean(v)))]
  const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((v): v is string => Boolean(v)))]
  const [cRows, aRows] = await Promise.all([
    companyIds.length ? db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds)) : Promise.resolve([]),
    actorIds.length ? db.select({ id: users.id, name: users.fullName, email: users.email }).from(users).where(inArray(users.id, actorIds)) : Promise.resolve([]),
  ])
  const companyName = new Map(cRows.map((c) => [c.id, c.name]))
  const actorName = new Map(aRows.map((a) => [a.id, a.name || a.email]))

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      from_company: r.fromCompanyId ? { id: r.fromCompanyId, name: companyName.get(r.fromCompanyId) ?? 'Deleted company' } : null,
      to_company: r.toCompanyId ? { id: r.toCompanyId, name: companyName.get(r.toCompanyId) ?? 'Deleted company' } : null,
      source: r.source,
      actor: r.actorUserId ? (actorName.get(r.actorUserId) ?? 'Unknown user') : null,
      ticket_id: r.ticketId ?? null,
      note: r.note ?? null,
      created_at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }))
  )
}
