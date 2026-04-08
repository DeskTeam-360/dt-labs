import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { fetchUserSessionEligibility, userRowAllowsSession } from '@/lib/auth-user-session'

/** Re-check DB at most this often (ms) per JWT to limit load. */
const JWT_USER_RECHECK_MS = 60_000

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null

          const email = (credentials.email as string).trim().toLowerCase()
          const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

          if (!user) {
            console.error('[Auth] User not found:', email)
            return null
          }
          if (!user.passwordHash) {
            console.error('[Auth] User has no password_hash:', email)
            return null
          }

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.passwordHash
          )
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
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (token.error === 'AccessRevoked') {
        return token
      }

      if (user) {
        token.id = user.id
        token.email = user.email
        token.role = (user as { role?: string }).role
        token.userCheckedAt = 0
      }

      const uid = token.id as string | undefined
      if (!uid) {
        return token
      }

      const now = Date.now()
      const last = typeof token.userCheckedAt === 'number' ? token.userCheckedAt : 0
      if (now - last < JWT_USER_RECHECK_MS) {
        return token
      }

      const ok = await fetchUserSessionEligibility(uid)
      if (!ok) {
        return {
          ...token,
          sub: undefined,
          id: undefined,
          email: undefined,
          role: undefined,
          name: undefined,
          picture: undefined,
          error: 'AccessRevoked',
          userCheckedAt: now,
        }
      }

      return { ...token, error: undefined, userCheckedAt: now }
    },
    async session({ session, token }) {
      if (token.error === 'AccessRevoked') {
        return {
          ...session,
          user: undefined,
          error: 'AccessRevoked',
        }
      }
      if (session.user && token.id) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        ;(session.user as { role?: string }).role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
})
