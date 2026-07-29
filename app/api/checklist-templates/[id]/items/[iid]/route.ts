import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { checklistTemplateItems, db } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role ?? ''
}

type Params = { params: Promise<{ id: string; iid: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionRole(session).toLowerCase() !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { iid } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Partial<typeof checklistTemplateItems.$inferInsert> = {}
  if (typeof body.title === 'string') updates.title = body.title.trim()
  if (typeof body.order_index === 'number') updates.orderIndex = body.order_index
  if ('group_id' in body)
    updates.groupId = typeof body.group_id === 'string' ? body.group_id : null
  if ('note' in body)
    updates.note = typeof body.note === 'string' ? body.note.trim() || null : null

  const [row] = await db
    .update(checklistTemplateItems)
    .set(updates)
    .where(eq(checklistTemplateItems.id, iid))
    .returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionRole(session).toLowerCase() !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { iid } = await params
  await db.delete(checklistTemplateItems).where(eq(checklistTemplateItems.id, iid))
  return NextResponse.json({ ok: true })
}
