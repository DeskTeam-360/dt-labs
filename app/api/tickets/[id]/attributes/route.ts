import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { db, ticketAttributs } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** POST /api/tickets/[id]/attributes - Add attribute */
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
  const { meta_key, meta_value } = body

  const [row] = await db
    .insert(ticketAttributs)
    .values({
      ticketId,
      metaKey: meta_key || 'key',
      metaValue: meta_value ?? null,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create attribute' }, { status: 500 })
  }

  bumpTicketDataVersion(ticketId)

  return NextResponse.json({
    id: row.id,
    ticket_id: row.ticketId,
    meta_key: row.metaKey,
    meta_value: row.metaValue,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}
