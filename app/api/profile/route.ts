import { auth } from '@/auth'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

/** PATCH /api/profile - Update current user profile */
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    full_name,
    avatar_url,
    phone,
    department,
    position,
    bio,
    timezone,
    locale,
  } = body

  const set: { fullName?: string; avatarUrl?: string; phone?: string | null; department?: string | null; position?: string | null; bio?: string | null; timezone?: string; locale?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  }
  if (full_name !== undefined) set.fullName = full_name
  if (avatar_url !== undefined) set.avatarUrl = avatar_url
  if (phone !== undefined) set.phone = phone
  if (department !== undefined) set.department = department
  if (position !== undefined) set.position = position
  if (bio !== undefined) set.bio = bio
  if (timezone !== undefined) set.timezone = timezone
  if (locale !== undefined) set.locale = locale

  const [updated] = await db
    .update(users)
    .set(set)
    .where(eq(users.id, session.user.id!))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    user: {
      full_name: updated.fullName,
      avatar_url: updated.avatarUrl,
      phone: updated.phone,
      department: updated.department,
      position: updated.position,
      bio: updated.bio,
      timezone: updated.timezone,
      locale: updated.locale,
    },
  })
}
