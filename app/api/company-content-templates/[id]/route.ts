import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { db, companyContentTemplates } from '@/lib/db'
import { eq } from 'drizzle-orm'

// GET - Get content template by ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const [row] = await db
      .select()
      .from(companyContentTemplates)
      .where(eq(companyContentTemplates.id, id))
      .limit(1)

    if (!row) {
      return NextResponse.json(
        { error: 'Content template not found' },
        { status: 404 }
      )
    }

    const data = {
      id: row.id,
      title: row.title,
      content: row.content,
      description: row.description,
      type: row.type,
      fields: row.fields,
      created_at: row.createdAt?.toISOString(),
      updated_at: row.updatedAt?.toISOString(),
    }
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch content template' },
      { status: 500 }
    )
  }
}

// PUT - Update content template
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { title, content, description, type, fields } = body

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content
    if (description !== undefined) updateData.description = description
    if (type !== undefined) updateData.type = type || null
    if (fields !== undefined) updateData.fields = Array.isArray(fields) && fields.length ? fields : null

    const [updated] = await db
      .update(companyContentTemplates)
      .set(updateData as Record<string, unknown>)
      .where(eq(companyContentTemplates.id, id))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Content template not found' }, { status: 404 })
    }

    const data = {
      id: updated.id,
      title: updated.title,
      content: updated.content,
      description: updated.description,
      type: updated.type,
      fields: updated.fields,
      created_at: updated.createdAt?.toISOString(),
      updated_at: updated.updatedAt?.toISOString(),
    }
    return NextResponse.json({ data, success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update content template' },
      { status: 500 }
    )
  }
}

// DELETE - Delete content template
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const [deleted] = await db
      .delete(companyContentTemplates)
      .where(eq(companyContentTemplates.id, id))
      .returning({ id: companyContentTemplates.id })

    if (!deleted) {
      return NextResponse.json({ error: 'Content template not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Content template deleted successfully',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete content template' },
      { status: 500 }
    )
  }
}
