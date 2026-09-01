import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { isAdmin } from '@/lib/auth-utils'
import { getCustomerCompanyId } from '@/lib/customer-company'
import { db, teamMembers, teams, tickets } from '@/lib/db'
import { getTicketDetail } from '@/lib/ticket-detail'

export const dynamic = 'force-dynamic'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
}

/** GET /api/tickets/[id]/detail — full ticket payload (same shape as getTicketDetail) for live refresh */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_CACHE_HEADERS })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const userId = session.user.id!

  // Team access control: non-admin staff can only view tickets in public teams or their own teams (or unassigned)
  if (!isAdmin(role) && role !== 'customer') {
    const [ticketRow] = await db
      .select({ teamId: tickets.teamId })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1)
    if (ticketRow?.teamId) {
      const [teamRow] = await db
        .select({ type: teams.type })
        .from(teams)
        .where(eq(teams.id, ticketRow.teamId))
        .limit(1)
      if (teamRow?.type !== 'public') {
        const [isMember] = await db
          .select({ teamId: teamMembers.teamId })
          .from(teamMembers)
          .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, ticketRow.teamId)))
          .limit(1)
        if (!isMember) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_CACHE_HEADERS })
        }
      }
    }
  }

  const detailOptions =
    role === 'customer'
      ? {
          screenshotUserId: userId,
          customerPortal: {
            userId,
            companyId: await getCustomerCompanyId(userId),
          },
        }
      : { screenshotUserId: userId }

  const data = await getTicketDetail(ticketId, detailOptions)

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_CACHE_HEADERS })
  }

  return NextResponse.json(data, { headers: NO_CACHE_HEADERS })
}
