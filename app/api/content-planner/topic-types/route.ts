import { asc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { contentPlannerTopicTypes,db } from '@/lib/db'

/** GET /api/content-planner/topic-types */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select()
    .from(contentPlannerTopicTypes)
    .orderBy(asc(contentPlannerTopicTypes.title))

  const data = rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    created_at: r.createdAt?.toISOString() ?? '',
    updated_at: r.updatedAt?.toISOString() ?? '',
  }))

  return NextResponse.json(data)
}

/** POST /api/content-planner/topic-types */
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
    .insert(contentPlannerTopicTypes)
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
