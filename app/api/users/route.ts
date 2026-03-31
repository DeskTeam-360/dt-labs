import { auth } from '@/auth'
import { db, users, companies, companyUsers } from '@/lib/db'
import { eq, desc, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** GET /api/users - List users with company. When customer: only users in same company */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id!
    const role = (session.user as { role?: string }).role?.toLowerCase()

    let companyId: string | null = null
    if (role === 'customer') {
      const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
      companyId = userRow?.companyId ?? null
      if (!companyId) {
        const [cu] = await db.select({ companyId: companyUsers.companyId }).from(companyUsers).where(eq(companyUsers.userId, userId)).limit(1)
        companyId = cu?.companyId ?? null
      }
    }

    if (role === 'customer' && !companyId) {
      return NextResponse.json([])
    }

    let query = db
      .select({
        user: users,
        company: companies,
      })
      .from(users)
      .leftJoin(companies, eq(users.companyId, companies.id))
      .orderBy(desc(users.createdAt))

    if (role === 'customer' && companyId) {
      const [directRows, cuRows] = await Promise.all([
        db.select({ id: users.id }).from(users).where(eq(users.companyId, companyId)),
        db
          .select({ userId: companyUsers.userId })
          .from(companyUsers)
          .where(eq(companyUsers.companyId, companyId)),
      ])
      const idSet = new Set<string>()
      for (const r of directRows) idSet.add(r.id)
      for (const r of cuRows) idSet.add(r.userId)
      const ids = [...idSet]
      if (ids.length === 0) {
        return NextResponse.json([])
      }
      query = query.where(inArray(users.id, ids)) as typeof query
    }

    const rows = await query

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
      is_email_verified: u.isEmailVerified,
    }
  })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[API /api/users]', err)
    const msg = err?.message || String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
