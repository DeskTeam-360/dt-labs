import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'
import { checklistTemplateItems, db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.templateId, id))
    .orderBy(checklistTemplateItems.orderIndex)

  return NextResponse.json(rows)
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const [row] = await db
    .insert(checklistTemplateItems)
    .values({
      templateId: id,
      groupId: typeof body.group_id === 'string' ? body.group_id : null,
      title,
      note: typeof body.note === 'string' ? body.note.trim() || null : null,
      orderIndex: typeof body.order_index === 'number' ? body.order_index : 0,
    })
    .returning()

  return NextResponse.json(row, { status: 201 })
}
