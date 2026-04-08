import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

/** Re-check DB at most this often (ms) per JWT to limit load (hanya di Node, bukan Edge). */
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
    async jwt({ token, user }) {
      if (token.error === 'AccessRevoked') {
        return token
      }

      if (user) {
        token.id = user.id
        token.email = user.email ?? undefined
        token.role = (user as { role?: string }).role
        token.userCheckedAt = 0
      }

      const uid = token.id as string | undefined
      if (!uid) {
        return token
      }

      // Edge: jangan load postgres / Drizzle (middleware sudah pakai getToken, bukan auth()).
      if (process.env.NEXT_RUNTIME === 'edge') {
        return token
      }

      const now = Date.now()
      const last = typeof token.userCheckedAt === 'number' ? token.userCheckedAt : 0
      if (now - last < JWT_USER_RECHECK_MS) {
        return token
      }

      let ok = false
      try {
        const { fetchUserSessionEligibility } = await import('@/lib/auth-user-session')
        ok = await fetchUserSessionEligibility(uid)
      } catch (err) {
        console.error('[auth] jwt eligibility DB check failed (session kept, will retry):', err)
        return { ...token, error: undefined, userCheckedAt: now }
      }

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
