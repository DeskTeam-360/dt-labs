import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'

import { auth } from '@/auth'
import {
  checklistTemplateGroups,
  checklistTemplateItems,
  checklistTemplates,
  db,
  ticketChecklist,
} from '@/lib/db'
import { bumpTicketDataVersion } from '@/lib/firebase/ticket-sync-server'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/tickets/[id]/checklist/apply-template
 * Body: { template_id: string }
 * Appends template items (with group_name) to the ticket checklist.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const templateId = typeof body.template_id === 'string' ? body.template_id : null
  if (!templateId) return NextResponse.json({ error: 'template_id is required' }, { status: 400 })

  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, templateId))
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const groups = await db
    .select()
    .from(checklistTemplateGroups)
    .where(eq(checklistTemplateGroups.templateId, templateId))
    .orderBy(checklistTemplateGroups.orderIndex)

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.templateId, templateId))
    .orderBy(checklistTemplateItems.orderIndex)

  const groupMap = new Map(groups.map((g) => [g.id, g.title]))

  if (items.length === 0) return NextResponse.json({ added: 0 })

  // Find current max order_index for this ticket
  const existing = await db
    .select({ orderIndex: ticketChecklist.orderIndex })
    .from(ticketChecklist)
    .where(eq(ticketChecklist.ticketId, ticketId))

  const maxOrder = existing.reduce((m, r) => Math.max(m, r.orderIndex ?? 0), 0)

  const rows = items.map((item, i) => ({
    ticketId,
    title: item.title,
    isCompleted: false,
    orderIndex: maxOrder + i + 1,
    groupName: item.groupId ? (groupMap.get(item.groupId) ?? null) : null,
    completionNote: item.note ?? null,
  }))

  await db.insert(ticketChecklist).values(rows)
  await bumpTicketDataVersion(ticketId)

  return NextResponse.json({ added: rows.length })
}
