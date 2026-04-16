import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

import { fetchUserSessionEligibility } from '@/lib/auth-user-session'
import { db, users } from '@/lib/db'

/** Hanya dipanggil dari Node (route sign-in), bukan Edge middleware. */
export async function authorizeWithCredentials(credentials: Record<'email' | 'password', string> | undefined) {
  try {
    if (!credentials?.email || !credentials?.password) return null

    const email = String(credentials.email).trim().toLowerCase()
    // Avoid `select *` so sign-in still works if `users.deleted_at` is not migrated yet (see fetchUserSessionEligibility).
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!user) {
      console.error('[Auth] User not found:', email)
      return null
    }
    if (!user.passwordHash) {
      console.error('[Auth] User has no password_hash:', email)
      return null
    }

    const valid = await bcrypt.compare(String(credentials.password), user.passwordHash)
    if (!valid) {
      console.error('[Auth] Invalid password for:', email)
      return null
    }

    if (!(await fetchUserSessionEligibility(user.id))) {
      console.error('[Auth] User inactive or removed:', email)
      return null
    }

    return {
      id: user.id,
      email: user.email,
      name: user.fullName || user.email,
      image: user.avatarUrl || undefined,
      role: user.role,
    }
  } catch (err) {
    console.error('[Auth] authorize error:', err)
    return null
  }
}
