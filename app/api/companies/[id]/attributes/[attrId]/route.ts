import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companyAttributes, db } from '@/lib/db'

function canEdit(role?: string) {
  return ['admin', 'manager'].includes((role ?? '').toLowerCase())
}

/** PATCH /api/companies/[id]/attributes/[attrId] */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; attrId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  if (!canEdit(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, attrId } = await params
  const body = await request.json()

  const [row] = await db
    .update(companyAttributes)
    .set({ metaValue: body.meta_value ?? null, updatedAt: new Date() })
    .where(and(eq(companyAttributes.id, attrId), eq(companyAttributes.companyId, id)))
    .returning()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    company_id: row.companyId,
    meta_key: row.metaKey,
    meta_value: row.metaValue,
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
  })
}

/** DELETE /api/companies/[id]/attributes/[attrId] */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attrId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role
  if (!canEdit(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, attrId } = await params
  await db
    .delete(companyAttributes)
    .where(and(eq(companyAttributes.id, attrId), eq(companyAttributes.companyId, id)))

  return NextResponse.json({ success: true })
}
