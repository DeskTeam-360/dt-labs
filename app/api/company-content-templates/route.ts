import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyContentTemplates } from '@/lib/db'
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

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
