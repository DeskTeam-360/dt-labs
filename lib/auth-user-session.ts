import { eq } from 'drizzle-orm'

import { db, users } from '@/lib/db'

/** Active login + JWT refresh: user must exist, not soft-deleted, status active. */
export function userRowAllowsSession(row: { status: string | null; deletedAt: Date | null } | undefined): boolean {
  if (!row) return false
  if (row.deletedAt != null) return false
  const s = (row.status ?? 'active').toLowerCase()
  return s === 'active'
}

export async function fetchUserSessionEligibility(userId: string) {
  const [row] = await db
    .select({ status: users.status, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return userRowAllowsSession(row)
}
