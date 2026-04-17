import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, users } from '@/lib/db'
import { revalidateTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

/** POST /api/users/create - Create user (replaces Supabase Auth) */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { email, password, full_name, role, status } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
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
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }

  revalidateTicketsLookupCatalog()
  return NextResponse.json({
    success: true,
    data: {
      id: row.id,
      email: row.email,
      full_name: row.fullName,
      role: row.role,
      status: row.status,
    },
  })
}
