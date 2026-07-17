import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

/** Re-check DB at most this often (ms) per JWT to limit load (Node only, not Edge). */
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
        const { authorizeWithCredentials } = await import('@/lib/auth-credentials-authorize')
        return authorizeWithCredentials(
          credentials as Record<'email' | 'password', string> | undefined
        )
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (token.error === 'AccessRevoked') {
        return token
      }

      if (user) {
        token.id = user.id
        token.email = user.email ?? undefined
        token.role = (user as { role?: string }).role
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false
        token.userCheckedAt = 0
      }

      const uid = token.id as string | undefined
      if (!uid) {
        return token
      }

      // Edge: do not load postgres / Drizzle (middleware already uses getToken, not auth()).
      if (process.env.NEXT_RUNTIME === 'edge') {
        return token
      }

      const now = Date.now()
      const mergeProfileFromDb = (
        refresh: { active: boolean; fullName: string | null; avatarUrl: string | null; mustChangePassword: boolean }
      ) => {
        if (!refresh.active) {
          return {
            ...token,
            sub: undefined,
            id: undefined,
            email: undefined,
            role: undefined,
            name: undefined,
            picture: undefined,
            error: 'AccessRevoked' as const,
            userCheckedAt: now,
          }
        }
        const email = (token.email as string | undefined) ?? ''
        const nextName = (refresh.fullName && String(refresh.fullName).trim()) || email || 'User'
        return {
          ...token,
          error: undefined,
          userCheckedAt: now,
          name: nextName,
          picture: refresh.avatarUrl || undefined,
          mustChangePassword: refresh.mustChangePassword,
        }
      }

      /** Client `useSession().update()` after profile (etc.): refresh name/avatar without waiting for throttle. */
      if (trigger === 'update') {
        try {
          const { fetchUserJwtRefreshData } = await import('@/lib/auth-user-session')
          const refresh = await fetchUserJwtRefreshData(uid)
          return mergeProfileFromDb(refresh)
        } catch (err) {
          console.error('[auth] jwt trigger=update DB fetch failed:', err)
          return token
        }
      }

      const last = typeof token.userCheckedAt === 'number' ? token.userCheckedAt : 0
      if (now - last < JWT_USER_RECHECK_MS) {
        return token
      }

      let refresh: { active: boolean; fullName: string | null; avatarUrl: string | null; mustChangePassword: boolean }
      try {
        const { fetchUserJwtRefreshData } = await import('@/lib/auth-user-session')
        refresh = await fetchUserJwtRefreshData(uid)
      } catch (err) {
        console.error('[auth] jwt eligibility DB check failed (session kept, will retry):', err)
        return { ...token, error: undefined, userCheckedAt: now }
      }

      return mergeProfileFromDb(refresh)
    },
    async session({ session, token }) {
      if (token.error === 'AccessRevoked') {
        return {
          ...session,
          user: undefined,
          error: 'AccessRevoked',
        }
      }
      /** Session subject: do not rely on `session.user` that already exists — Auth.js Credentials often sends empty/undefined `user`; getToken in middleware still looks at `id` in JWT → loop login↔dashboard. */
      const userId =
        (typeof token.id === 'string' && token.id.length > 0 ? token.id : undefined) ??
        (typeof token.sub === 'string' && token.sub.length > 0 ? token.sub : undefined)
      if (!userId) {
        return session
      }

      if (!session.user) {
        session.user = {
          id: userId,
          email: (token.email as string | undefined) ?? '',
          name: '',
          emailVerified: null,
        }
      }

      session.user.id = userId
      session.user.email = (token.email as string | undefined) ?? session.user.email ?? ''
      ;(session.user as { role?: string }).role = token.role as string
      if (typeof token.name === 'string' && token.name.length > 0) {
        session.user.name = token.name
      } else if (!session.user.name || String(session.user.name).trim().length === 0) {
        session.user.name = session.user.email || 'User'
      }
      if (typeof token.picture === 'string') {
        session.user.image = token.picture
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
  events: {
    async signIn({ user, account }) {
      const userId = user?.id
      if (!userId || typeof userId !== 'string') return
      try {
        const { eq } = await import('drizzle-orm')
        const { db, users } = await import('@/lib/db')
        const { logUserLogin } = await import('@/lib/system-activity-log')
        const now = new Date()
        await db
          .update(users)
          .set({ lastLoginAt: now, lastActiveAt: now })
          .where(eq(users.id, userId))
        await logUserLogin({
          userId,
          role: (user as { role?: string }).role,
          email: user.email ?? null,
          provider: account?.provider ?? 'credentials',
        })
      } catch (err) {
        console.error('[auth] signIn activity log failed:', err)
      }
    },
  },
  trustHost: true,
})
