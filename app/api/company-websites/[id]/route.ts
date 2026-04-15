import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { companyWebsites } from '@/lib/db'

/** PATCH /api/company-websites/[id] */
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
  const { url, title, description, is_primary, company_id } = body

  const existing = await db.select().from(companyWebsites).where(eq(companyWebsites.id, id)).limit(1)
  if (!existing.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const cid = company_id ?? existing[0].companyId
  if (is_primary) {
    await db
      .update(companyWebsites)
      .set({ isPrimary: false })
      .where(eq(companyWebsites.companyId, cid))
  }

  const updateData: Record<string, unknown> = {}
  if (url !== undefined) updateData.url = url
  if (title !== undefined) updateData.title = title || null
  if (description !== undefined) updateData.description = description || null
  if (is_primary !== undefined) updateData.isPrimary = is_primary
  updateData.updatedAt = new Date()

  const [row] = await db
    .update(companyWebsites)
    .set(updateData)
    .where(eq(companyWebsites.id, id))
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      id: row.id,
      company_id: row.companyId,
      url: row.url,
      title: row.title,
      description: row.description,
      is_primary: row.isPrimary ?? false,
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
    },
    success: true,
  })
}

/** DELETE /api/company-websites/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await db.delete(companyWebsites).where(eq(companyWebsites.id, id))
  return NextResponse.json({ success: true })
}
