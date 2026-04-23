import { eq } from 'drizzle-orm'

import { db, users } from '@/lib/db'

/** Active login + JWT refresh: user must exist, not soft-deleted, status active. */
export function userRowAllowsSession(row: { status: string | null; deletedAt: Date | null } | undefined): boolean {
  if (!row) return false
  if (row.deletedAt != null) return false
  const s = (row.status ?? 'active').toLowerCase()
  return s === 'active'
}

function missingUsersDeletedAtColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  if (/deleted_at/i.test(msg)) return true
  // PostgreSQL undefined_column
  if (/42703/i.test(msg) && /column/i.test(msg)) return true
  return false
}

/**
 * JWT refresh / session gate.
 * Returns false (no throw) when: no row (hard-deleted user or stale token id), status not active,
 * or soft-deleted (`deleted_at` set — needs column; run `drizzle/migrations/026_users_deleted_at.sql`).
 * If `deleted_at` is missing from the DB, falls back to `status` only (same false when row is gone).
 */
export async function fetchUserSessionEligibility(userId: string) {
  try {
    const [row] = await db
      .select({ status: users.status, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    return userRowAllowsSession(row)
  } catch (err) {
    if (!missingUsersDeletedAtColumn(err)) throw err
    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    // Must not spread undefined: { ...undefined, deletedAt: null } would look “active” via status ?? 'active'
    if (row === undefined) return false
    return userRowAllowsSession({ status: row.status, deletedAt: null })
  }
}

/**
 * JWT refresh (Node): one DB round-trip for active gate + display fields so session name/avatar
 * stay aligned with `users` after profile edits.
 */
export async function fetchUserJwtRefreshData(userId: string): Promise<{
  active: boolean
  fullName: string | null
  avatarUrl: string | null
}> {
  try {
    const [row] = await db
      .select({
        status: users.status,
        deletedAt: users.deletedAt,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!row || !userRowAllowsSession(row)) {
      return { active: false, fullName: null, avatarUrl: null }
    }
    return { active: true, fullName: row.fullName, avatarUrl: row.avatarUrl }
  } catch (err) {
    if (!missingUsersDeletedAtColumn(err)) throw err
    const [row] = await db
      .select({
        status: users.status,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (row === undefined || !userRowAllowsSession({ status: row.status, deletedAt: null })) {
      return { active: false, fullName: null, avatarUrl: null }
    }
    return { active: true, fullName: row.fullName, avatarUrl: row.avatarUrl }
  }
}
