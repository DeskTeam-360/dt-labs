import { and, eq } from 'drizzle-orm'

import { companyUsers,db, users } from '@/lib/db'

/** Company UUID for a portal customer (`users.company_id` or `company_users`). */
export async function getCustomerCompanyId(userId: string): Promise<string | null> {
  const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
  let companyId = userRow?.companyId ?? null
  if (!companyId) {
    const [cu] = await db
      .select({ companyId: companyUsers.companyId })
      .from(companyUsers)
      .where(eq(companyUsers.userId, userId))
      .limit(1)
    companyId = cu?.companyId ?? null
  }
  return companyId
}

export async function customerOwnsCompany(userId: string, companyId: string): Promise<boolean> {
  const cid = await getCustomerCompanyId(userId)
  return cid !== null && cid === companyId
}

/** User is linked to this company via `users.company_id` or `company_users`. */
export async function userBelongsToCompany(userId: string, companyId: string): Promise<boolean> {
  const [u] = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (u?.companyId === companyId) return true
  const [cu] = await db
    .select({ companyId: companyUsers.companyId })
    .from(companyUsers)
    .where(and(eq(companyUsers.userId, userId), eq(companyUsers.companyId, companyId)))
    .limit(1)
  return !!cu
}

/**
 * Can manage portal accounts and company contact/branding for this company.
 * - Explicit: `company_users.company_role === 'company_admin'` for this company.
 * - Legacy fallback: if the company has no explicit portal admin yet, the customer whose
 *   `users.company_id` is this company may manage (typical first account).
 */
export async function isCompanyPortalAdmin(userId: string, companyId: string): Promise<boolean> {
  const [cu] = await db
    .select({ companyRole: companyUsers.companyRole })
    .from(companyUsers)
    .where(and(eq(companyUsers.userId, userId), eq(companyUsers.companyId, companyId)))
    .limit(1)

  if (cu?.companyRole === 'company_admin') return true

  const [anyAdmin] = await db
    .select({ userId: companyUsers.userId })
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.companyRole, 'company_admin')))
    .limit(1)

  if (anyAdmin) return false

  const [u] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
  return u?.companyId === companyId
}
