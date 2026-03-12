import { auth } from '@/auth'
import { db, contentPlannerChannels } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PUT /api/content-planner/channels/[id] - Full update */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = String(body.title).trim()
  if (body.description !== undefined) updates.description = (body.description as string)?.trim() || null
  if (body.company_ai_system_template_id !== undefined) updates.companyAiSystemTemplateId = body.company_ai_system_template_id || null

  const [updated] = await db
    .update(contentPlannerChannels)
    .set(updates as Record<string, unknown>)
    .where(eq(contentPlannerChannels.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    description: updated.description,
    company_ai_system_template_id: updated.companyAiSystemTemplateId,
  })
}

/** PATCH /api/content-planner/channels/[id] - Update channel template */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const templateId = (body.company_ai_system_template_id as string) || null

  const [updated] = await db
    .update(contentPlannerChannels)
    .set({ companyAiSystemTemplateId: templateId })
    .where(eq(contentPlannerChannels.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: updated.id,
    company_ai_system_template_id: updated.companyAiSystemTemplateId,
  })
}

/** DELETE /api/content-planner/channels/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const [deleted] = await db
    .delete(contentPlannerChannels)
    .where(eq(contentPlannerChannels.id, id))
    .returning({ id: contentPlannerChannels.id })

  if (!deleted) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
