import { auth } from '@/auth'
import { db, contentPlannerTopicTypes } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PUT /api/content-planner/topic-types/[id] */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const title = (body.title as string)?.trim()
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const [updated] = await db
    .update(contentPlannerTopicTypes)
    .set({
      title,
      description: (body.description as string)?.trim() || null,
    })
    .where(eq(contentPlannerTopicTypes.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

/** DELETE /api/content-planner/topic-types/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const [deleted] = await db
    .delete(contentPlannerTopicTypes)
    .where(eq(contentPlannerTopicTypes.id, id))
    .returning({ id: contentPlannerTopicTypes.id })

  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
