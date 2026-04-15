'use server'

import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

import { auth } from '@/auth'
import { db, users } from '@/lib/db'

export async function createUser(formData: {
  email: string
  password: string
  full_name: string
  first_name?: string | null
  last_name?: string | null
  role: string
  status: string
}) {
  const session = await auth()
  if (!session?.user) {
    return { error: 'Unauthorized' }
  }

  try {
    const { email, password, full_name, first_name, last_name, role, status } = formData

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
        firstName: first_name?.trim() ? first_name.trim() : null,
        lastName: last_name?.trim() ? last_name.trim() : null,
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

