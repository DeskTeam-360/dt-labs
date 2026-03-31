import { auth } from '@/auth'
import { db, companies } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getCompanyDetail } from '@/lib/company-detail'
import { customerOwnsCompany } from '@/lib/customer-company'

/** GET /api/companies/[id] - Get company with related data */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    const ok = await customerOwnsCompany(session.user.id!, id)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const companyData = await getCompanyDetail(id)
  if (!companyData) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  return NextResponse.json({ data: companyData })
}

/** PUT /api/companies/[id] - Update company */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, email, is_active, color } = body
  const role = (session.user as { role?: string }).role?.toLowerCase()
  const isCustomer = role === 'customer'

  if (isCustomer) {
    const ok = await customerOwnsCompany(session.user.id!, id)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (email !== undefined) updateData.email = email?.trim() || null
  if (!isCustomer && is_active !== undefined) updateData.isActive = is_active
  if (color !== undefined) updateData.color = color

  const [row] = await db
    .update(companies)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      id: row.id,
      name: row.name,
      email: row.email,
      color: row.color,
      is_active: row.isActive ?? true,
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
    },
    success: true,
  })
}

/** DELETE /api/companies/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role === 'customer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  await db.delete(companies).where(eq(companies.id, id))

  return NextResponse.json({ success: true, message: 'Company deleted successfully' })
}
