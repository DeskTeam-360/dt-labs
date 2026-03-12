import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { db, companyDataTemplates } from '@/lib/db'
import { eq } from 'drizzle-orm'

// GET - Get data template by ID
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
      .from(companyDataTemplates)
      .where(eq(companyDataTemplates.id, id))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: 'Data template not found' }, { status: 404 })
    }

    const data = {
      id: row.id,
      title: row.title,
      group: row.group,
      is_active: row.isActive ?? true,
    }
    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch data template' },
      { status: 500 }
    )
  }
}

// PUT - Update data template
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
    const { title, group, is_active } = body

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (group !== undefined) updateData.group = group || null
    if (is_active !== undefined) updateData.isActive = is_active

    const [updated] = await db
      .update(companyDataTemplates)
      .set(updateData as Partial<typeof companyDataTemplates.$inferInsert>)
      .where(eq(companyDataTemplates.id, id))
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Data template not found' }, { status: 404 })
    }

    const data = {
      id: updated.id,
      title: updated.title,
      group: updated.group,
      is_active: updated.isActive ?? true,
    }
    return NextResponse.json({ data, success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update data template' },
      { status: 500 }
    )
  }
}

// DELETE - Delete data template
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

    const deleted = await db
      .delete(companyDataTemplates)
      .where(eq(companyDataTemplates.id, id))
      .returning({ id: companyDataTemplates.id })

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Data template not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Data template deleted successfully',
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete data template' },
      { status: 500 }
    )
  }
}
