import { auth } from '@/auth'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { userBelongsToCompany, isCompanyPortalAdmin } from '@/lib/customer-company'
import { upsertCompanyUserMembership } from '@/lib/upsert-company-user-membership'

const COMPANY_ROLES = ['member', 'company_admin'] as const
type CompanyRole = (typeof COMPANY_ROLES)[number]

function isCompanyRole(v: unknown): v is CompanyRole {
  return typeof v === 'string' && (COMPANY_ROLES as readonly string[]).includes(v)
}

/** PATCH — set password (portal admin or global admin); set company_role (global admin only) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: companyId, userId: targetUserId } = await params
  if (!companyId || !targetUserId) {
    return NextResponse.json({ error: 'Company and user ID required' }, { status: 400 })
  }

  const sessionRole = (session.user as { role?: string }).role?.toLowerCase()
  const isGlobalAdmin = sessionRole === 'admin'

  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  if ((target.role || '').toLowerCase() !== 'customer') {
    return NextResponse.json({ error: 'Only customer accounts can be managed here' }, { status: 400 })
  }
  if (!(await userBelongsToCompany(targetUserId, companyId))) {
    return NextResponse.json({ error: 'User is not in this company' }, { status: 400 })
  }

  const body = await request.json()
  let didSomething = false

  if (body && body.company_role !== undefined) {
    if (!isGlobalAdmin) {
      return NextResponse.json({ error: 'Only system admin can change portal admin role' }, { status: 403 })
    }
    if (!isCompanyRole(body.company_role)) {
      return NextResponse.json({ error: 'Invalid company_role' }, { status: 400 })
    }
    await upsertCompanyUserMembership({
      companyId,
      userId: targetUserId,
      companyRole: body.company_role,
    })
    didSomething = true
  }

  if (body && body.password !== undefined && body.password !== null && body.password !== '') {
    if (!isGlobalAdmin && !(await isCompanyPortalAdmin(session.user.id, companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const password = String(body.password)
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    await db
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10), updatedAt: new Date() })
      .where(eq(users.id, targetUserId))
    didSomething = true
  }

  if (!didSomething) {
    return NextResponse.json({ error: 'No changes' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
