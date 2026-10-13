import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canViewCustomerReports } from '@/lib/auth-utils'
import { companies, db, tickets } from '@/lib/db'

/**
 * GET /api/users/[id]/created-tickets?limit&offset
 * Tickets created by the given user (newest first). Admin/manager/staff, or the user themself.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const role = (session.user as { role?: string }).role
  if (session.user.id !== id && !canViewCustomerReports(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0)

  const where = and(eq(tickets.createdBy, id), ne(tickets.ticketType, 'project'))

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: tickets.id,
        title: tickets.title,
        status: tickets.status,
        ticket_type: tickets.ticketType,
        created_at: tickets.createdAt,
        company_name: companies.name,
      })
      .from(tickets)
      .leftJoin(companies, eq(tickets.companyId, companies.id))
      .where(where)
      .orderBy(desc(tickets.createdAt), desc(tickets.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(tickets).where(where),
  ])

  return NextResponse.json({
    tickets: rows.map((r) => ({ ...r, created_at: r.created_at ? new Date(r.created_at).toISOString() : null })),
    total,
  })
}
