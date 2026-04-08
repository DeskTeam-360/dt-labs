import 'next-auth'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    email?: string | null
    name?: string | null
    image?: string | null
    role?: string
  }

  interface Session extends DefaultSession {
    user?: DefaultSession['user'] & {
      id: string
      role?: string
    }
    /** Set when JWT is invalidated (inactive / deleted user). Client should sign out. */
    error?: 'AccessRevoked'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    email?: string
    role?: string
    error?: 'AccessRevoked'
    userCheckedAt?: number
  }
}
