import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyDataTemplates } from '@/lib/db'
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

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
