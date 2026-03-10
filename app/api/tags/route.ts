import { auth } from '@/auth'
import { db } from '@/lib/db'
import { tags } from '@/lib/db'
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/tags - List all tags */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db.select().from(tags).orderBy(asc(tags.name))

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    color: r.color ?? '#000000',
    created_at: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    updated_at: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  }))

  return NextResponse.json(data)
}

/** POST /api/tags - Create tag */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, slug, color } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug required' }, { status: 400 })
  }

  const [inserted] = await db
    .insert(tags)
    .values({
      name: String(name).trim(),
      slug: String(slug).trim().toLowerCase().replace(/\s+/g, '_'),
      color: color || '#000000',
    })
    .returning()

  if (!inserted) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({
    id: inserted.id,
    name: inserted.name,
    slug: inserted.slug,
    color: inserted.color ?? '#000000',
    created_at: inserted.createdAt ? new Date(inserted.createdAt).toISOString() : '',
    updated_at: inserted.updatedAt ? new Date(inserted.updatedAt).toISOString() : '',
  })
}
