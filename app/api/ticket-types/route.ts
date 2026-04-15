import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { ticketTypes } from '@/lib/db'

/** GET /api/ticket-types - List all ticket types */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.select().from(ticketTypes).orderBy(asc(ticketTypes.sortOrder))

  const data = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description ?? '',
    color: r.color ?? '#000000',
    sort_order: r.sortOrder ?? 0,
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/ticket-types - Create ticket type */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, slug, color, sort_order, description } = body

  if (!title || !slug) {
    return NextResponse.json({ error: 'title and slug required' }, { status: 400 })
  }

  const [inserted] = await db
    .insert(ticketTypes)
    .values({
      title: String(title).trim(),
      slug: String(slug).trim().toLowerCase().replace(/\s+/g, '_'),
      description: typeof description === 'string' ? description : '',
      color: color || '#000000',
      ...(sort_order !== undefined && { sortOrder: Number(sort_order) ?? 0 }),
    })
    .returning()

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({
    id: inserted.id,
    slug: inserted.slug,
    title: inserted.title,
    description: inserted.description ?? '',
    color: inserted.color ?? '#000000',
    sort_order: inserted.sortOrder ?? 0,
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
