import { auth } from '@/auth'
import { db, companies, users, companyUsers } from '@/lib/db'
import { and, eq, ne } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getCompanyDetail } from '@/lib/company-detail'
import { customerOwnsCompany } from '@/lib/customer-company'
import { upsertCompanyUserMembership } from '@/lib/upsert-company-user-membership'

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
  const { name, email, is_active, color, leader_user_id } = body
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

  if (leader_user_id !== undefined) {
    if (isCustomer) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!leader_user_id || typeof leader_user_id !== 'string') {
      return NextResponse.json({ error: 'Company leader is required' }, { status: 400 })
    }
    const [leader] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, leader_user_id))
      .limit(1)
    if (!leader) {
      return NextResponse.json({ error: 'Company leader not found' }, { status: 404 })
    }
    if ((leader.role || '').toLowerCase() !== 'customer') {
      return NextResponse.json({ error: 'Company leader must be a customer user' }, { status: 400 })
    }
  }

  const [row] = await db
    .update(companies)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning()

  if (!row) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  if (leader_user_id !== undefined && !isCustomer) {
    await db
      .update(companyUsers)
      .set({ companyRole: 'member', updatedAt: new Date() })
      .where(and(eq(companyUsers.companyId, id), ne(companyUsers.userId, leader_user_id)))
    await db
      .update(users)
      .set({ companyId: id, updatedAt: new Date() })
      .where(eq(users.id, leader_user_id))
    await upsertCompanyUserMembership({
      companyId: id,
      userId: leader_user_id,
      companyRole: 'company_admin',
    })
  }

  const [leaderRow] = await db
    .select({ userId: companyUsers.userId })
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, id), eq(companyUsers.companyRole, 'company_admin')))
    .limit(1)

  return NextResponse.json({
    data: {
      id: row.id,
      name: row.name,
      email: row.email,
      created_by: leaderRow?.userId ?? null,
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
