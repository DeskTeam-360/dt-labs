import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, tickets } from '@/lib/db'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const companyId: string | undefined = body.company_id
  if (!companyId) return NextResponse.json({ error: 'company_id required' }, { status: 400 })

  // Load all non-closed tickets for this company, sort by id asc
  const rows = await db
    .select({ id: tickets.id, status: tickets.status, priority: tickets.priority })
    .from(tickets)
    .where(eq(tickets.companyId, companyId))
    .orderBy(tickets.id)

  const eligible = rows.filter((r) => !isClosedLikeTicketStatus(r.status))
  if (eligible.length === 0) return NextResponse.json({ updated: 0 })

  // Use the existing two-phase write to safely assign ranks 1..N by ID order
  // Phase 1: set to negative to clear UNIQUE constraint conflicts
  for (const r of eligible) {
    await db.update(tickets).set({ priority: -Math.abs(r.id) }).where(eq(tickets.id, r.id))
  }
  // Phase 2: assign rank 1..N (smallest ID = rank 1)
  for (let i = 0; i < eligible.length; i++) {
    await db.update(tickets).set({ priority: i + 1 }).where(eq(tickets.id, eligible[i]!.id))
  }

  return NextResponse.json({ updated: eligible.length })
}
