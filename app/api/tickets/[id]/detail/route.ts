import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyUsers,users } from '@/lib/db'
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
  let customerCompanyId: string | undefined
  if (role === 'customer' && session.user.id) {
    const userId = session.user.id
    const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
    let cid = userRow?.companyId ?? null
    if (!cid) {
      const [cu] = await db
        .select({ companyId: companyUsers.companyId })
        .from(companyUsers)
        .where(eq(companyUsers.userId, userId))
        .limit(1)
      cid = cu?.companyId ?? null
    }
    if (!cid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_CACHE_HEADERS })
    }
    customerCompanyId = cid
  }

  const data = await getTicketDetail(ticketId, {
    screenshotUserId: session.user.id!,
    ...(customerCompanyId ? { companyId: customerCompanyId } : {}),
  })

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_CACHE_HEADERS })
  }

  return NextResponse.json(data, { headers: NO_CACHE_HEADERS })
}
