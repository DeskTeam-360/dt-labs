import { and, desc, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import {
  companyContentPlanners,
  contentPlannerChannels,
  contentPlannerTopicTypes,
  db,
} from '@/lib/db'

/** GET /api/companies/[id]/content-planner - List planners with channel and topic_type */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId } = await params

  const rows = await db
    .select({
      planner: companyContentPlanners,
      channelId: contentPlannerChannels.id,
      channelTitle: contentPlannerChannels.title,
      topicTypeId: contentPlannerTopicTypes.id,
      topicTypeTitle: contentPlannerTopicTypes.title,
    })
    .from(companyContentPlanners)
    .leftJoin(contentPlannerChannels, eq(companyContentPlanners.channelId, contentPlannerChannels.id))
    .leftJoin(contentPlannerTopicTypes, eq(companyContentPlanners.topicTypeId, contentPlannerTopicTypes.id))
    .where(eq(companyContentPlanners.companyId, companyId))
    .orderBy(desc(companyContentPlanners.publishDate), desc(companyContentPlanners.createdAt))

  const data = rows.map((r) => {
    const p = r.planner
    return {
      id: p.id,
      company_id: p.companyId,
      channel_id: p.channelId,
      topic: p.topic,
      topic_description: p.topicDescription,
      topic_type_id: p.topicTypeId,
      hashtags: p.hashtags,
      primary_keyword: p.primaryKeyword,
      secondary_keywords: p.secondaryKeywords,
      intents: p.intents ?? [],
      location: p.location,
      cta_dynamic: p.ctaDynamic ?? false,
      cta_type: p.ctaType,
      cta_text: p.ctaText,
      publish_date: p.publishDate?.toISOString().slice(0, 10) ?? null,
      status: p.status ?? 'planned',
      insight: p.insight,
      ai_content_results: p.aiContentResults,
      created_at: p.createdAt?.toISOString() ?? '',
      updated_at: p.updatedAt?.toISOString() ?? '',
      channel: r.channelId ? { id: r.channelId, title: r.channelTitle } : null,
      topic_type: r.topicTypeId ? { id: r.topicTypeId, title: r.topicTypeTitle } : null,
    }
  })

  return NextResponse.json(data)
}

/** POST /api/companies/[id]/content-planner - Create planner(s) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId } = await params
  const body = await request.json().catch(() => ({}))
  const items = Array.isArray(body) ? body : [body]
  if (items.length === 0) {
    return NextResponse.json({ error: 'No items to create' }, { status: 400 })
  }

  const rows = items.map((item: Record<string, unknown>) => ({
    companyId: companyId,
    channelId: (item.channel_id as string) || null,
    topic: (item.topic as string)?.trim() || null,
    topicDescription: (item.topic_description as string)?.trim() || null,
    topicTypeId: (item.topic_type_id as string) || null,
    hashtags: (item.hashtags as string)?.trim() || null,
    primaryKeyword: (item.primary_keyword as string)?.trim() || null,
    secondaryKeywords: (item.secondary_keywords as string)?.trim() || null,
    intents: Array.isArray(item.intents) ? item.intents : [],
    location: (item.location as string)?.trim() || null,
    ctaDynamic: !!item.cta_dynamic,
    ctaType: (item.cta_type as string) || null,
    ctaText: (item.cta_text as string)?.trim() || null,
    publishDate: item.publish_date ? new Date(item.publish_date as string) : null,
    status: (item.status as string) || 'draft',
    insight: (item.insight as string)?.trim() || null,
  }))

  const inserted = await db
    .insert(companyContentPlanners)
    .values(rows)
    .returning({ id: companyContentPlanners.id })

  return NextResponse.json({
    created: inserted.length,
    ids: inserted.map((r) => r.id),
  })
}

/** DELETE /api/companies/[id]/content-planner?ids=... - Bulk delete */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId } = await params
  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  await db
    .delete(companyContentPlanners)
    .where(
      and(
        eq(companyContentPlanners.companyId, companyId),
        inArray(companyContentPlanners.id, ids)
      )
    )

  return NextResponse.json({ deleted: ids.length })
}
