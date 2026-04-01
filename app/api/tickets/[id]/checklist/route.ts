import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { db, ticketChecklist } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** POST /api/tickets/[id]/checklist - Add checklist item */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const body = await request.json()
  const { title, order_index } = body

  const [row] = await db
    .insert(ticketChecklist)
    .values({
      ticketId: ticketId,
      title: title || 'Item',
      isCompleted: false,
      orderIndex: order_index ?? 0,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  bumpTicketDataVersion(ticketId)

  return NextResponse.json({
    id: row.id,
    ticket_id: row.ticketId,
    title: row.title,
    is_completed: row.isCompleted,
    order_index: row.orderIndex ?? 0,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
  })
}
