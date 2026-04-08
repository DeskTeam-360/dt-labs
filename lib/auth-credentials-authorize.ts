import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { userRowAllowsSession } from '@/lib/auth-user-session'

/** Hanya dipanggil dari Node (route sign-in), bukan Edge middleware. */
export async function authorizeWithCredentials(credentials: Record<'email' | 'password', string> | undefined) {
  try {
    if (!credentials?.email || !credentials?.password) return null

    const email = String(credentials.email).trim().toLowerCase()
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

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

    if (!userRowAllowsSession({ status: user.status, deletedAt: user.deletedAt })) {
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
