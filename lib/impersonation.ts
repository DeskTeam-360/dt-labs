import { eq } from 'drizzle-orm'
import type { JWT } from 'next-auth/jwt'

import { userRowAllowsSession } from '@/lib/auth-user-session'
import { db, users } from '@/lib/db'
import { logSystemActivity } from '@/lib/system-activity-log'

/** "View as" a client lasts this long, then the session goes back to the admin or manager by itself. */
export const VIEW_AS_MINUTES = 60
/** Who may look at the app the way a client sees it. */
export const VIEW_AS_ROLES = ['admin', 'manager']

type Basics = { id: string; email: string; role: string; name: string; picture: string | undefined; mustChangePassword: boolean; allowed: boolean }

async function loadBasics(id: string): Promise<Basics | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, role: users.role, fullName: users.fullName, avatarUrl: users.avatarUrl, mustChangePassword: users.mustChangePassword, status: users.status, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    role: (row.role ?? '').toLowerCase(),
    name: (row.fullName && row.fullName.trim()) || row.email,
    picture: row.avatarUrl || undefined,
    mustChangePassword: !!row.mustChangePassword,
    allowed: userRowAllowsSession({ status: row.status, deletedAt: row.deletedAt }),
  }
}

/**
 * Starts "view as" for a client: the session becomes that client's, read only (the middleware refuses every change), and it ends after VIEW_AS_MINUTES.
 * Only an admin or manager who is still active may do it, and only for an active client. Returns the new token, or null when it is not allowed.
 * The real person is kept in the token (`impersonatorId`), so the choice cannot be faked from the browser: this check runs on the server every time.
 */
export async function startViewAs(token: JWT, targetId: string): Promise<JWT | null> {
  const realId = (typeof token.impersonatorId === 'string' ? token.impersonatorId : token.id) as string | undefined
  if (!realId) return null
  const [actor, target] = await Promise.all([loadBasics(realId), loadBasics(targetId)])
  if (!actor || !actor.allowed || !VIEW_AS_ROLES.includes(actor.role)) return null
  if (!target || !target.allowed || target.role !== 'customer' || target.id === actor.id) return null

  await logSystemActivity({
    category: 'auth',
    action: 'impersonation_started',
    entityType: 'user',
    entityId: target.id,
    actorUserId: actor.id,
    actorRole: actor.role,
    metadata: { target_email: target.email, target_name: target.name, read_only: true, minutes: VIEW_AS_MINUTES },
  })
  return {
    ...token,
    id: target.id,
    email: target.email,
    role: target.role,
    name: target.name,
    picture: target.picture,
    mustChangePassword: false,
    error: undefined,
    userCheckedAt: 0,
    impersonatorId: actor.id,
    impersonatorName: actor.name,
    impersonationExpiresAt: Date.now() + VIEW_AS_MINUTES * 60000,
  }
}

/** Back to the real person (they pressed Exit, or the hour ran out). If that person can no longer sign in, the session ends. */
export async function endViewAs(token: JWT, reason: 'ended' | 'expired'): Promise<JWT> {
  const realId = typeof token.impersonatorId === 'string' ? token.impersonatorId : null
  const actor = realId ? await loadBasics(realId) : null
  await logSystemActivity({
    category: 'auth',
    action: reason === 'ended' ? 'impersonation_ended' : 'impersonation_expired',
    entityType: 'user',
    entityId: (token.id as string | undefined) ?? null,
    actorUserId: realId,
    actorRole: actor?.role ?? null,
    metadata: { target_email: token.email ?? null },
  })
  const cleared = { impersonatorId: undefined, impersonatorName: undefined, impersonationExpiresAt: undefined }
  if (!actor || !actor.allowed) {
    return { ...token, ...cleared, sub: undefined, id: undefined, email: undefined, role: undefined, name: undefined, picture: undefined, error: 'AccessRevoked' }
  }
  return { ...token, ...cleared, id: actor.id, email: actor.email, role: actor.role, name: actor.name, picture: actor.picture, mustChangePassword: actor.mustChangePassword, error: undefined, userCheckedAt: 0 }
}
