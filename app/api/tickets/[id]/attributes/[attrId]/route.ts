import { auth } from '@/auth'
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

  const { attrId } = await params
  const body = await request.json()
  const { meta_value } = body

  await db
    .update(ticketAttributs)
    .set({ metaValue: meta_value ?? null, updatedAt: new Date() })
    .where(eq(ticketAttributs.id, attrId))

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

  const { attrId } = await params
  await db.delete(ticketAttributs).where(eq(ticketAttributs.id, attrId))
  return NextResponse.json({ ok: true })
}
