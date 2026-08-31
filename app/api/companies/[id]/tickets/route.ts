import { and, asc, eq, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, tickets, ticketStatuses } from '@/lib/db'

/** GET /api/companies/[id]/tickets?limit=5 — top tickets by priority (lowest number = highest priority) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const url = new URL(request.url)
  const limit = Math.min(10, Math.max(1, parseInt(url.searchParams.get('limit') ?? '5', 10)))

  const rows = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      status: tickets.status,
      statusLabel: ticketStatuses.title,
      priority: tickets.priority,
    })
    .from(tickets)
    .leftJoin(ticketStatuses, eq(tickets.status, ticketStatuses.slug))
    .where(and(eq(tickets.companyId, id), ne(tickets.ticketType, 'trash'), ne(tickets.ticketType, 'spam')))
    .orderBy(asc(tickets.priority))
    .limit(limit)

  return NextResponse.json({
    data: rows.map(r => ({
      id: r.id,
      title: r.title,
      status: r.statusLabel ?? r.status,
      priority: r.priority,
    })),
  })
}
