import { and, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketAssignees, tickets } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** GET /api/tickets/my-count -> { count } of the signed-in staff member's tickets that still need work (Open, Received, Working Team). */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (role === 'customer') return NextResponse.json({ count: 0 })
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${tickets.id})::int` })
    .from(tickets)
    .innerJoin(ticketAssignees, eq(ticketAssignees.ticketId, tickets.id))
    .where(and(eq(ticketAssignees.userId, session.user.id), inArray(tickets.status, ['open', 'received', 'working_team']), eq(tickets.ticketType, 'support')))
  return NextResponse.json({ count: row?.n ?? 0 })
}
