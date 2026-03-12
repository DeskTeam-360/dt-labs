import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyAiSystemTemplate } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PUT /api/company-ai-system-templates/[id] - update template */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { title, content, format } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const [row] = await db
    .update(companyAiSystemTemplate)
    .set({
      title: String(title),
      content: content ?? '',
      format: format?.trim() || null,
    })
    .where(eq(companyAiSystemTemplate.id, id))
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: row.id,
    title: row.title,
    content: row.content ?? '',
    format: row.format,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  })
}

/** DELETE /api/company-ai-system-templates/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  await db
    .delete(companyAiSystemTemplate)
    .where(eq(companyAiSystemTemplate.id, id))

  return NextResponse.json({ success: true })
}
