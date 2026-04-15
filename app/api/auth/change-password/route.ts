import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { db, users } from '@/lib/db'

/** POST /api/auth/change-password - Change user password */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { currentPassword, newPassword } = body

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'currentPassword and newPassword required' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

  if (!user?.passwordHash) {
    return NextResponse.json({ error: 'Password not set for this account' }, { status: 400 })
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, session.user.id))

  return NextResponse.json({ success: true })
}
