import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'
import { checklistTemplateGroups, db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

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
    .insert(checklistTemplateGroups)
    .values({ templateId: id, title, orderIndex: body.order_index ?? 0 })
    .returning()

  return NextResponse.json(row, { status: 201 })
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const rows = await db
    .select()
    .from(checklistTemplateGroups)
    .where(eq(checklistTemplateGroups.templateId, id))
    .orderBy(checklistTemplateGroups.orderIndex)

  return NextResponse.json(rows)
}
