import { auth } from '@/auth'
import { db, contentPlannerIntents } from '@/lib/db'
import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/content-planner/intents */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select()
    .from(contentPlannerIntents)
    .orderBy(asc(contentPlannerIntents.title))

  const data = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    created_at: r.createdAt?.toISOString() ?? '',
    updated_at: r.updatedAt?.toISOString() ?? '',
  }))

  return NextResponse.json(data)
}

/** POST /api/content-planner/intents */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const title = (body.title as string)?.trim()
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const [row] = await db
    .insert(contentPlannerIntents)
    .values({
      title,
      description: (body.description as string)?.trim() || null,
    })
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  return NextResponse.json({
    id: row.id,
    title: row.title,
    description: row.description,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }, { status: 201 })
}
