import { auth } from '@/auth'
import { db, users, companies } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/users/[id] - Get user detail */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const [row] = await db
    .select({
      user: users,
      company: companies,
    })
    .from(users)
    .leftJoin(companies, eq(users.companyId, companies.id))
    .where(eq(users.id, id))

  if (!row?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const u = row.user
  return NextResponse.json({
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    role: u.role,
    status: u.status,
    company_id: u.companyId,
    company: row.company ? { id: row.company.id, name: row.company.name } : null,
    avatar_url: u.avatarUrl,
    created_at: u.createdAt ? new Date(u.createdAt).toISOString() : '',
    updated_at: u.updatedAt ? new Date(u.updatedAt).toISOString() : '',
    last_login_at: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
    last_active_at: u.lastActiveAt ? new Date(u.lastActiveAt).toISOString() : null,
    phone: u.phone,
    department: u.department,
    position: u.position,
    bio: u.bio,
    timezone: u.timezone,
    locale: u.locale,
    permissions: u.permissions,
    is_email_verified: u.isEmailVerified,
    metadata: u.metadata,
  })
}

/** PATCH /api/users/[id] - Update user */
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

  const updateData: Record<string, unknown> = {}
  if (body.full_name !== undefined) updateData.fullName = body.full_name
  if (body.role !== undefined) updateData.role = body.role
  if (body.status !== undefined) updateData.status = body.status
  if (body.company_id !== undefined) updateData.companyId = body.company_id || null
  if (body.avatar_url !== undefined) updateData.avatarUrl = body.avatar_url
  if (body.phone !== undefined) updateData.phone = body.phone || null
  if (body.department !== undefined) updateData.department = body.department || null
  if (body.position !== undefined) updateData.position = body.position || null
  if (body.bio !== undefined) updateData.bio = body.bio || null
  if (body.timezone !== undefined) updateData.timezone = body.timezone || 'UTC'
  if (body.locale !== undefined) updateData.locale = body.locale || 'en'
  if (body.is_email_verified !== undefined) updateData.isEmailVerified = body.is_email_verified
  if (body.permissions !== undefined) updateData.permissions = body.permissions
  if (body.metadata !== undefined) updateData.metadata = body.metadata

  await db.update(users).set({ ...updateData, updatedAt: new Date() }).where(eq(users.id, id))

  return NextResponse.json({ ok: true })
}

/** DELETE /api/users/[id] */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await db.delete(users).where(eq(users.id, id))

  return NextResponse.json({ ok: true })
}
