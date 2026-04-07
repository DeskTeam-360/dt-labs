import { auth } from '@/auth'
import { db } from '@/lib/db'
import { tags } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PATCH /api/tags/[id] - Update tag */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, slug, color } = body

  const values: Record<string, unknown> = {}
  if (name !== undefined) values.name = String(name).trim()
  if (slug !== undefined) values.slug = String(slug).trim().toLowerCase().replace(/\s+/g, '_')
  if (color !== undefined) values.color = color || '#000000'

  if (Object.keys(values).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const [updated] = await db
    .update(tags)
    .set(values as typeof tags.$inferInsert)
    .where(eq(tags.id, id))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    color: updated.color ?? '#000000',
    created_at: updated.createdAt ? new Date(updated.createdAt).toISOString() : '',
    updated_at: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/tags/[id] - Delete tag */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const [deleted] = await db
      .delete(tags)
      .where(eq(tags.id, id))
      .returning({ id: tags.id })

    if (!deleted) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return NextResponse.json(
        { error: 'Cannot delete: this tag is currently in use on one or more tickets. It must be removed from all tickets before deletion.' },
        { status: 409 }
      )
    }
    console.error('[DELETE tags]', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
