import { auth } from '@/auth'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import ProfileContent from '@/components/content/ProfileContent'

export default async function ProfilePage() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const [userRow] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
  const userData = userRow
    ? {
        first_name: userRow.firstName,
        last_name: userRow.lastName,
        full_name: userRow.fullName,
        avatar_url: userRow.avatarUrl,
        phone: userRow.phone,
        bio: userRow.bio,
        department: userRow.department,
        position: userRow.position,
        timezone: userRow.timezone ?? 'UTC',
        locale: userRow.locale ?? 'en',
      }
    : undefined

  return (
    <ProfileContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        user_metadata: { full_name: session.user.name, avatar_url: userRow?.avatarUrl ?? null },
      }}
      userData={userData}
    />
  )
}

