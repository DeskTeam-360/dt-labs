import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyAiSystemTemplate } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/company-ai-system-templates - returns full list for management */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select()
    .from(companyAiSystemTemplate)
    .orderBy(desc(companyAiSystemTemplate.createdAt))

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content ?? '',
    format: r.format,
    created_at: r.createdAt?.toISOString() ?? '',
    updated_at: r.updatedAt?.toISOString() ?? '',
  })))
}

/** POST /api/company-ai-system-templates - create template */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, content, format } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const [row] = await db
    .insert(companyAiSystemTemplate)
    .values({
      title: String(title),
      content: content ?? '',
      format: format?.trim() || null,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  return NextResponse.json({
    id: row.id,
    title: row.title,
    content: row.content ?? '',
    format: row.format,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }, { status: 201 })
}
