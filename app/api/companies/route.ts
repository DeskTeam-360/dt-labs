import { auth } from '@/auth'
import { db, companies } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/companies - List companies */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const isActiveParam = url.searchParams.get('is_active')

  const rows = await db
    .select()
    .from(companies)
    .orderBy(desc(companies.createdAt))

  let filtered = rows
  if (isActiveParam !== null && isActiveParam !== undefined) {
    const active = isActiveParam === 'true'
    filtered = rows.filter((r) => r.isActive === active)
  }

  const data = filtered.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    color: r.color,
    is_active: r.isActive ?? true,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json({ data })
}

/** POST /api/companies - Create company */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, email, is_active, color } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const [row] = await db
    .insert(companies)
    .values({
      name,
      email: email?.trim() || null,
      color: color || '#000000',
      isActive: is_active !== undefined ? is_active : true,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 })
  }

  return NextResponse.json(
    {
      data: {
        id: row.id,
        name: row.name,
        email: row.email,
        color: row.color,
        is_active: row.isActive ?? true,
        created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
        updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
      },
      success: true,
    },
    { status: 201 }
  )
}
