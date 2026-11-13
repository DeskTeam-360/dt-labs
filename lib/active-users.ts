import { inArray } from 'drizzle-orm'

import { db, users } from '@/lib/db'
import { isUserInactive } from '@/lib/user-status'

/** Of these user ids, the people who are switched off or suspended (they must not be given new work). */
export async function inactiveAmong(ids: string[]): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return []
  const rows = await db.select({ id: users.id, fullName: users.fullName, email: users.email, status: users.status }).from(users).where(inArray(users.id, ids))
  return rows.filter((r) => isUserInactive(r.status)).map((r) => ({ id: r.id, name: r.fullName || r.email }))
}

/** The same ids without the inactive people. */
export async function keepActiveUserIds(ids: string[]): Promise<string[]> {
  const off = new Set((await inactiveAmong(ids)).map((p) => p.id))
  return off.size === 0 ? ids : ids.filter((id) => !off.has(id))
}
