import { auth } from '@/auth'
import { db } from '@/lib/db'
import { knowledgeBaseArticles } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/knowledge-base-articles/[id] - Get single article */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const [row] = await db.select().from(knowledgeBaseArticles).where(eq(knowledgeBaseArticles.id, id)).limit(1)

  if (!row) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: row.id,
    title: row.title,
    status: row.status,
    description: row.description ?? '',
    category: row.category ?? 'general',
    sort_order: row.sortOrder ?? 0,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}

/** PATCH /api/knowledge-base-articles/[id] - Update article */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { title, status, description, category, sort_order } = body

  const values: Record<string, unknown> = {}
  if (title !== undefined) values.title = String(title).trim()
  if (status !== undefined) values.status = status === 'published' ? 'published' : 'draft'
  if (description !== undefined) values.description = description?.trim() || null
  if (category !== undefined) values.category = category?.trim() || 'general'
  if (sort_order !== undefined) values.sortOrder = Number(sort_order) ?? 0

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(knowledgeBaseArticles)
    .set(values as typeof knowledgeBaseArticles.$inferInsert)
    .where(eq(knowledgeBaseArticles.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    status: updated.status,
    description: updated.description ?? '',
    category: updated.category ?? 'general',
    sort_order: updated.sortOrder ?? 0,
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/knowledge-base-articles/[id] - Delete article */
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
    .delete(knowledgeBaseArticles)
    .where(eq(knowledgeBaseArticles.id, id))
    .returning({ id: knowledgeBaseArticles.id })

  if (!deleted) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
