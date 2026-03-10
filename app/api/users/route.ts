import { auth } from '@/auth'
import { db, users, companies } from '@/lib/db'
import { eq, desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/users - List users with company */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({
      user: users,
      company: companies,
    })
    .from(users)
    .leftJoin(companies, eq(users.companyId, companies.id))
    .orderBy(desc(users.createdAt))

  const result = rows.map((r) => {
    const u = r.user
    return {
      id: u.id,
      email: u.email,
      full_name: u.fullName,
      role: u.role,
      status: u.status,
      company_id: u.companyId,
      company: r.company ? { id: r.company.id, name: r.company.name } : null,
      avatar_url: u.avatarUrl,
      created_at: u.createdAt ? new Date(u.createdAt).toISOString() : '',
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
    }
  })

  return NextResponse.json(result)
}
