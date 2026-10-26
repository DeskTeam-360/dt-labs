import { eq } from 'drizzle-orm'

import { companyUsers, db, userCompanyChanges, users } from '@/lib/db'

export type UserCompanyChange = {
  userId: string
  from: string | null
  to: string | null
  /** admin_edit | company_leader | email_sender | email_cc | portal_cc | freshdesk_import ... */
  source: string
  actorUserId?: string | null
  ticketId?: number | null
  note?: string | null
}

/** Writes one history row. Never throws: a missing table or a failed log must not break the action itself. */
export async function logUserCompanyChange(c: UserCompanyChange): Promise<void> {
  if (c.from === c.to) return
  try {
    await db.insert(userCompanyChanges).values({
      userId: c.userId,
      fromCompanyId: c.from,
      toCompanyId: c.to,
      source: c.source,
      actorUserId: c.actorUserId ?? null,
      ticketId: c.ticketId ?? null,
      note: c.note ?? null,
    })
  } catch (e) {
    console.error('[user-company] could not log change:', (e as Error)?.message)
  }
}

/**
 * A person is CC'd (or writes as a CC) on a ticket of this company.
 * Only customers are linked, and a customer who already belongs to another company is left alone:
 * being CC'd on someone else's ticket must never move them. A customer with no company is attached.
 */
export async function linkCcUserToCompany(p: { userId: string; companyId: string; source: string; ticketId?: number | null }): Promise<void> {
  const [u] = await db.select({ role: users.role, companyId: users.companyId }).from(users).where(eq(users.id, p.userId)).limit(1)
  if (!u) return
  if ((u.role ?? '').toLowerCase() !== 'customer') return
  if (u.companyId && u.companyId !== p.companyId) return
  if (!u.companyId) {
    await db.update(users).set({ companyId: p.companyId, updatedAt: new Date() }).where(eq(users.id, p.userId))
    await logUserCompanyChange({ userId: p.userId, from: null, to: p.companyId, source: p.source, ticketId: p.ticketId })
  }
  try {
    await db.insert(companyUsers).values({ companyId: p.companyId, userId: p.userId }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
  } catch {}
}
