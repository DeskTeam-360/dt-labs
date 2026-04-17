import { and, eq } from 'drizzle-orm'

import { companyUsers, db, users } from '@/lib/db'

/**
 * Validates ticket.contact_user_id: must exist, have email, and belong to ticket company when company is set.
 */
export async function assertTicketContactUserAllowed(
  contactUserId: string | null,
  companyId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!contactUserId) return { ok: true }

  const [u] = await db
    .select({
      id: users.id,
      email: users.email,
      companyId: users.companyId,
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

  if (!companyId) {
    return { ok: true }
  }

  if (u.companyId === companyId) {
    return { ok: true }
  }

  const [cu] = await db
    .select({ userId: companyUsers.userId })
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, contactUserId)))
    .limit(1)

  if (cu) {
    return { ok: true }
  }

  return { ok: false, error: 'Contact must be a member of this ticket company' }
}
