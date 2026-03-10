import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  companyKnowledgeBases,
  companyContentTemplates,
} from '@/lib/db'
import { eq, desc, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/companies/[id]/knowledge-bases */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const rows = await db
    .select()
    .from(companyKnowledgeBases)
    .where(eq(companyKnowledgeBases.companyId, id))
    .orderBy(desc(companyKnowledgeBases.updatedAt))

  const templateIds = [...new Set(rows.map((r) => r.contentTemplateId).filter(Boolean))] as string[]
  let templateMap: Record<string, { id: string; title: string; fields: string[] | null }> = {}

  if (templateIds.length > 0) {
    const templates = await db
      .select({ id: companyContentTemplates.id, title: companyContentTemplates.title, fields: companyContentTemplates.fields })
      .from(companyContentTemplates)
      .where(inArray(companyContentTemplates.id, templateIds))
    for (const t of templates) {
      templateMap[t.id] = { id: t.id, title: t.title, fields: t.fields }
    }
  }

  const data = rows.map((r) => ({
    id: r.id,
    company_id: r.companyId,
    type: r.type,
    content: r.content,
    source_ids: r.sourceIds,
    content_template_id: r.contentTemplateId,
    used_fields: r.usedFields,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
    company_content_templates: r.contentTemplateId && templateMap[r.contentTemplateId]
      ? templateMap[r.contentTemplateId]
      : null,
  }))

  return NextResponse.json(data)
}

/** POST /api/companies/[id]/knowledge-bases - upsert */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { type, content, content_template_id, source_ids } = body

  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const payload = {
    companyId: id,
    type: type || 'generated',
    content,
    contentTemplateId: content_template_id || null,
    sourceIds: Array.isArray(source_ids) ? source_ids : null,
    usedFields: null,
  }

  const existing = await db
    .select()
    .from(companyKnowledgeBases)
    .where(eq(companyKnowledgeBases.companyId, id))
    .limit(100)

  const match = content_template_id
    ? existing.find((r) => r.contentTemplateId === content_template_id)
    : null

  if (match) {
    await db
      .update(companyKnowledgeBases)
      .set({
        type: payload.type,
        content: payload.content,
        sourceIds: payload.sourceIds,
        updatedAt: new Date(),
      })
      .where(eq(companyKnowledgeBases.id, match.id))
  } else {
    await db.insert(companyKnowledgeBases).values({
      companyId: id,
      type: payload.type,
      content: payload.content,
      contentTemplateId: payload.contentTemplateId,
      sourceIds: payload.sourceIds,
    })
  }

  return NextResponse.json({ success: true })
}
