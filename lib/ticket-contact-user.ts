import { and, asc, eq } from 'drizzle-orm'

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
 * Companies a contact belongs to for ticket purposes: primary company plus admin-granted additional
 * companies (`company_users.ticket_access`). Falls back to the effective company when there are none.
 */
export async function getContactCompanyIds(userId: string): Promise<string[]> {
  const [[u], granted] = await Promise.all([
    db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({ companyId: companyUsers.companyId })
      .from(companyUsers)
      .where(and(eq(companyUsers.userId, userId), eq(companyUsers.ticketAccess, true))),
  ])
  const ids = new Set<string>()
  if (u?.companyId) ids.add(u.companyId)
  for (const r of granted) ids.add(r.companyId)
  if (ids.size === 0) {
    const fallback = await getEffectiveCompanyIdForUser(userId)
    if (fallback) ids.add(fallback)
  }
  return [...ids]
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
