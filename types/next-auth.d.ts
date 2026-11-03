import 'next-auth'

import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    email?: string | null
    name?: string | null
    image?: string | null
    role?: string
    mustChangePassword?: boolean
  }

  interface Session extends DefaultSession {
    user?: DefaultSession['user'] & {
      id: string
      role?: string
    }
    /** Set when JWT is invalidated (inactive / deleted user). Client should sign out. */
    error?: 'AccessRevoked'
    /** Set while an admin or manager looks at the app as a client (read only). */
    impersonation?: { by_id: string; by_name: string; expires_at: number }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    email?: string
    role?: string
    name?: string
    picture?: string
    error?: 'AccessRevoked'
    userCheckedAt?: number
    /** Set while an admin or manager looks at the app as a client ("view as"): who it really is and until when. */
    impersonatorId?: string
    impersonatorName?: string
    impersonationExpiresAt?: number
    mustChangePassword?: boolean
  }
}
