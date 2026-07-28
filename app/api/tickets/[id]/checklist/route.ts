import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, ticketChecklist, users } from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { mapChecklistItemToDto } from '@/lib/ticket-checklist-map'

/** GET /api/tickets/[id]/checklist - List checklist items */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const rows = await db
    .select({
      item: ticketChecklist,
      completer: {
        id: users.id,
        fullName: users.fullName,
        email: users.email,
      },
    })
    .from(ticketChecklist)
    .leftJoin(users, eq(ticketChecklist.completedByUserId, users.id))
    .where(eq(ticketChecklist.ticketId, ticketId))
    .orderBy(asc(ticketChecklist.orderIndex))

  return NextResponse.json(rows.map((r) => mapChecklistItemToDto(r.item, r.completer ?? undefined)))
}

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
  const { title, order_index, group_name } = body

  const [row] = await db
    .insert(ticketChecklist)
    .values({
      ticketId: ticketId,
      title: title || 'Item',
      isCompleted: false,
      orderIndex: order_index ?? 0,
      groupName: typeof group_name === 'string' ? group_name.trim() || null : null,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  bumpTicketDataVersion(ticketId)

  return NextResponse.json(mapChecklistItemToDto(row))
}
