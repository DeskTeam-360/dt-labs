import { asc, eq } from 'drizzle-orm'

import { companyUsers, db, users } from '@/lib/db'

/**
 * Primary company for a user: `users.company_id`, else earliest `company_users` row.
 */
export async function getEffectiveCompanyIdForUser(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (u?.companyId) return u.companyId
  const [cu] = await db
    .select({ companyId: companyUsers.companyId })
    .from(companyUsers)
    .where(eq(companyUsers.userId, userId))
    .orderBy(asc(companyUsers.createdAt))
    .limit(1)
  return cu?.companyId ?? null
}

/**
 * Validates ticket.contact_user_id: user must exist and have an email (any company allowed).
 */
export async function assertTicketContactUserAllowed(
  contactUserId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!contactUserId) return { ok: true }

  const [u] = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, contactUserId))
    .limit(1)

  if (!u) {
    return { ok: false, error: 'Contact user not found' }
  }
  if (!String(u.email || '').trim()) {
    return { ok: false, error: 'Contact user must have an email address' }
  }

  return { ok: true }
}
