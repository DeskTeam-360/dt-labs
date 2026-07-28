
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import { checklistTemplateGroups, checklistTemplateItems, checklistTemplates, db } from '@/lib/db'

function sessionRole(session: { user?: { role?: string } } | null) {
  return (session?.user as { role?: string } | undefined)?.role ?? ''
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await db
    .select({
      id: checklistTemplates.id,
      title: checklistTemplates.title,
      description: checklistTemplates.description,
      created_at: checklistTemplates.createdAt,
      updated_at: checklistTemplates.updatedAt,
    })
    .from(checklistTemplates)
    .orderBy(checklistTemplates.title)

  return NextResponse.json(templates)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (sessionRole(session).toLowerCase() !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const userId = (session.user as { id?: string }).id ?? null

  const [row] = await db
    .insert(checklistTemplates)
    .values({
      title,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      createdByUserId: userId,
    })
    .returning()

  // If groups were included in the payload, insert them with their items
  if (Array.isArray(body.groups)) {
    for (const g of body.groups as { title: string; order_index?: number; items?: { title: string; order_index?: number }[] }[]) {
      const gTitle = typeof g.title === 'string' ? g.title.trim() : ''
      if (!gTitle) continue
      const [gRow] = await db
        .insert(checklistTemplateGroups)
        .values({ templateId: row.id, title: gTitle, orderIndex: g.order_index ?? 0 })
        .returning()
      for (const item of g.items ?? []) {
        const iTitle = typeof item.title === 'string' ? item.title.trim() : ''
        if (!iTitle) continue
        await db.insert(checklistTemplateItems).values({
          templateId: row.id,
          groupId: gRow.id,
          title: iTitle,
          orderIndex: item.order_index ?? 0,
        })
      }
    }
  }

  // Items without groups
  if (Array.isArray(body.items)) {
    for (const item of body.items as { title: string; order_index?: number }[]) {
      const iTitle = typeof item.title === 'string' ? item.title.trim() : ''
      if (!iTitle) continue
      await db.insert(checklistTemplateItems).values({
        templateId: row.id,
        groupId: null,
        title: iTitle,
        orderIndex: item.order_index ?? 0,
      })
    }
  }

  return NextResponse.json(row, { status: 201 })
}
