import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'
import { checklistTemplateGroups, checklistTemplateItems, checklistTemplates, db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, id))
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const groups = await db
    .select()
    .from(checklistTemplateGroups)
    .where(eq(checklistTemplateGroups.templateId, id))
    .orderBy(checklistTemplateGroups.orderIndex)

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.templateId, id))
    .orderBy(checklistTemplateItems.orderIndex)

  return NextResponse.json({ ...template, groups, items })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const updates: Partial<typeof checklistTemplates.$inferInsert> = {}
  if (typeof body.title === 'string') updates.title = body.title.trim()
  if ('description' in body)
    updates.description = typeof body.description === 'string' ? body.description.trim() || null : null
  updates.updatedAt = new Date()

  const [row] = await db
    .update(checklistTemplates)
    .set(updates)
    .where(eq(checklistTemplates.id, id))
    .returning()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(row)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessChecklistTemplates((session.user as { role?: string }).role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  await db.delete(checklistTemplates).where(eq(checklistTemplates.id, id))
  return NextResponse.json({ ok: true })
}
