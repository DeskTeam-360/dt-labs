import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

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

          return {
            id: user.id,
            email: user.email,
            name: user.fullName || user.email,
            image: user.avatarUrl || undefined,
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
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
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
