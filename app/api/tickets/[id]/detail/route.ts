import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getCustomerCompanyId } from '@/lib/customer-company'
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
