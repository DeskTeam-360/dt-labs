import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyContentTemplates } from '@/lib/db'

/** GET /api/company-content-templates */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select()
    .from(companyContentTemplates)
    .orderBy(asc(companyContentTemplates.title))

  const data = rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    description: r.description,
    fields: r.fields,
    type: r.type,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json({ data })
}

/** POST /api/company-content-templates - create */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, content, description, type, fields } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const [row] = await db
    .insert(companyContentTemplates)
    .values({
      title: String(title).trim(),
      content: content ?? null,
      description: description?.trim() || null,
      type: type?.trim() || null,
      fields: Array.isArray(fields) && fields.length ? fields : null,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      id: row.id,
      title: row.title,
      content: row.content,
      description: row.description,
      type: row.type,
      fields: row.fields,
      created_at: row.createdAt?.toISOString() ?? '',
      updated_at: row.updatedAt?.toISOString() ?? '',
    },
  }, { status: 201 })
}
