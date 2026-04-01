import { auth } from '@/auth'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'
import { db, ticketAttributs } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PATCH /api/tickets/[id]/attributes/[attrId] - Update attribute */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; attrId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, attrId } = await params
  const ticketId = parseInt(id, 10)
  const body = await request.json()
  const { meta_value } = body

  await db
    .update(ticketAttributs)
    .set({ metaValue: meta_value ?? null, updatedAt: new Date() })
    .where(eq(ticketAttributs.id, attrId))

  if (!isNaN(ticketId)) bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}

/** DELETE /api/tickets/[id]/attributes/[attrId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; attrId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, attrId } = await params
  const ticketId = parseInt(id, 10)
  await db.delete(ticketAttributs).where(eq(ticketAttributs.id, attrId))
  if (!isNaN(ticketId)) bumpTicketDataVersion(ticketId)
  return NextResponse.json({ ok: true })
}
