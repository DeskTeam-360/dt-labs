import { auth } from '@/auth'
import { db } from '@/lib/db'
import { knowledgeBaseArticles } from '@/lib/db'
import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/knowledge-base-articles - List articles. ?published=true for customer (only published) */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const publishedOnly = searchParams.get('published') === 'true'

  const rows = publishedOnly
    ? await db
        .select()
        .from(knowledgeBaseArticles)
        .where(eq(knowledgeBaseArticles.status, 'published'))
        .orderBy(asc(knowledgeBaseArticles.sortOrder), asc(knowledgeBaseArticles.createdAt))
    : await db
        .select()
        .from(knowledgeBaseArticles)
        .orderBy(asc(knowledgeBaseArticles.sortOrder), asc(knowledgeBaseArticles.createdAt))

  const data = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    description: r.description ?? '',
    category: r.category ?? 'general',
    sort_order: r.sortOrder ?? 0,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/knowledge-base-articles - Create article (admin) */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, status, description, category, sort_order } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const [inserted] = await db
    .insert(knowledgeBaseArticles)
    .values({
      title: String(title).trim(),
      status: status === 'published' ? 'published' : 'draft',
      description: description?.trim() || null,
      category: category?.trim() || 'general',
      sortOrder: Number(sort_order) ?? 0,
    })
    .returning()

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({
    id: inserted.id,
    title: inserted.title,
    status: inserted.status,
    description: inserted.description ?? '',
    category: inserted.category ?? 'general',
    sort_order: inserted.sortOrder ?? 0,
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
