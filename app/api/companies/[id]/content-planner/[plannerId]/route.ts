import { auth } from '@/auth'
import { db, companyContentPlanners } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PUT /api/companies/[id]/content-planner/[plannerId] - Update planner */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; plannerId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId, plannerId } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (body.channel_id !== undefined) updates.channelId = body.channel_id || null
  if (body.topic !== undefined) updates.topic = (body.topic as string)?.trim() || null
  if (body.topic_description !== undefined) updates.topicDescription = (body.topic_description as string)?.trim() || null
  if (body.topic_type_id !== undefined) updates.topicTypeId = body.topic_type_id || null
  if (body.hashtags !== undefined) updates.hashtags = (body.hashtags as string)?.trim() || null
  if (body.primary_keyword !== undefined) updates.primaryKeyword = (body.primary_keyword as string)?.trim() || null
  if (body.secondary_keywords !== undefined) updates.secondaryKeywords = (body.secondary_keywords as string)?.trim() || null
  if (body.intents !== undefined) updates.intents = Array.isArray(body.intents) ? body.intents : []
  if (body.location !== undefined) updates.location = (body.location as string)?.trim() || null
  if (body.cta_dynamic !== undefined) updates.ctaDynamic = !!body.cta_dynamic
  if (body.cta_type !== undefined) updates.ctaType = (body.cta_type as string) || null
  if (body.cta_text !== undefined) updates.ctaText = (body.cta_text as string)?.trim() || null
  if (body.publish_date !== undefined) updates.publishDate = body.publish_date ? new Date(body.publish_date as string) : null
  if (body.status !== undefined) updates.status = (body.status as string) || 'planned'
  if (body.insight !== undefined) updates.insight = (body.insight as string)?.trim() || null
  if (body.ai_content_results !== undefined) updates.aiContentResults = body.ai_content_results

  const [updated] = await db
    .update(companyContentPlanners)
    .set(updates as Record<string, unknown>)
    .where(
      and(
        eq(companyContentPlanners.id, plannerId),
        eq(companyContentPlanners.companyId, companyId)
      )
    )
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

/** DELETE /api/companies/[id]/content-planner/[plannerId] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; plannerId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId, plannerId } = await params

  const [deleted] = await db
    .delete(companyContentPlanners)
    .where(
      and(
        eq(companyContentPlanners.id, plannerId),
        eq(companyContentPlanners.companyId, companyId)
      )
    )
    .returning({ id: companyContentPlanners.id })

  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
