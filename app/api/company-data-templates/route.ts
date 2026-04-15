import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyDataTemplates } from '@/lib/db'

/** GET /api/company-data-templates */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const isActive = searchParams.get('is_active')
  const group = searchParams.get('group')

  const rows = await db
    .select()
    .from(companyDataTemplates)
    .orderBy(asc(companyDataTemplates.group), asc(companyDataTemplates.title))

  let filtered = rows
  if (isActive !== null && isActive !== undefined) {
    filtered = filtered.filter((r) => r.isActive === (isActive === 'true'))
  }
  if (group) {
    filtered = filtered.filter((r) => r.group === group)
  }

  const data = filtered.map((r) => ({
    id: r.id,
    title: r.title,
    group: r.group,
    is_active: r.isActive ?? true,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json({ data })
}

/** POST /api/company-data-templates - create */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, group, is_active } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const id = String(title).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 255) || `dt-${Date.now()}`

  const [row] = await db
    .insert(companyDataTemplates)
    .values({
      id,
      title: String(title).trim(),
      group: group?.trim() || null,
      isActive: is_active ?? true,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  return NextResponse.json({
    id: row.id,
    title: row.title,
    group: row.group,
    is_active: row.isActive ?? true,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }, { status: 201 })
}
