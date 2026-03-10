'use server'

import { auth } from '@/auth'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

export async function createUser(formData: {
  email: string
  password: string
  full_name: string
  role: string
  status: string
}) {
  const session = await auth()
  if (!session?.user) {
    return { error: 'Unauthorized' }
  }

  try {
    const { email, password, full_name, role, status } = formData

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (existing) {
      return { error: 'Email already registered' }
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const [row] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        fullName: full_name || null,
        role: role || 'user',
        status: status || 'active',
      })
      .returning()

    if (!row) {
      return { error: 'Failed to create user' }
    }

    return {
      success: true,
      data: {
        id: row.id,
        email: row.email,
        full_name: row.fullName,
        role: row.role,
        status: row.status,
      },
    }
  } catch (error: any) {
    return { error: error.message || 'Failed to create user' }
  }
}

