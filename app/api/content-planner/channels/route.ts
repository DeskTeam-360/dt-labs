import { asc,eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companyAiSystemTemplate,contentPlannerChannels, db } from '@/lib/db'

/** GET /api/content-planner/channels - List channels with template */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({
      channel: contentPlannerChannels,
      templateId: companyAiSystemTemplate.id,
      templateTitle: companyAiSystemTemplate.title,
    })
    .from(contentPlannerChannels)
    .leftJoin(companyAiSystemTemplate, eq(contentPlannerChannels.companyAiSystemTemplateId, companyAiSystemTemplate.id))
    .orderBy(asc(contentPlannerChannels.title))

  const data = rows.map((r) => ({
    id: r.channel.id,
    title: r.channel.title,
    description: r.channel.description,
    company_ai_system_template_id: r.channel.companyAiSystemTemplateId,
    created_at: r.channel.createdAt?.toISOString() ?? '',
    updated_at: r.channel.updatedAt?.toISOString() ?? '',
    company_ai_system_template: r.templateId ? { id: r.templateId, title: r.templateTitle } : null,
  }))

  return NextResponse.json(data)
}

/** POST /api/content-planner/channels - Create channel */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const title = (body.title as string)?.trim()
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const description = (body.description as string)?.trim() || null
  const companyAiSystemTemplateId = (body.company_ai_system_template_id as string) || null

  const [existing] = await db
    .select({ id: contentPlannerChannels.id })
    .from(contentPlannerChannels)
    .where(eq(contentPlannerChannels.title, title))
    .limit(1)

  if (existing) {
    return NextResponse.json({ id: existing.id, title })
  }

  const [inserted] = await db
    .insert(contentPlannerChannels)
    .values({ title, description, companyAiSystemTemplateId })
    .returning({ id: contentPlannerChannels.id, title: contentPlannerChannels.title })

  if (!inserted) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  return NextResponse.json({ id: inserted.id, title: inserted.title }, { status: 201 })
}
