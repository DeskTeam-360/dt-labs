import { and, eq } from 'drizzle-orm'

import { companyUsers,db } from '@/lib/db'

/**
 * Insert or update a company_users row without ON CONFLICT — works when the table
 * has no composite primary key / unique constraint (legacy DBs).
 */
export async function upsertCompanyUserMembership(args: {
  companyId: string
  userId: string
  companyRole: string
}) {
  const { companyId, userId, companyRole } = args
  const now = new Date()

  const [existing] = await db
    .select()
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)))
    .limit(1)

  if (existing) {
    await db
      .update(companyUsers)
      .set({ companyRole, updatedAt: now })
      .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.userId, userId)))
  } else {
    await db.insert(companyUsers).values({
      companyId,
      userId,
      companyRole,
      createdAt: now,
      updatedAt: now,
    })
  }
}
