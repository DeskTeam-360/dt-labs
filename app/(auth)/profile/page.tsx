import { eq } from 'drizzle-orm'

import { auth } from '@/auth'
import ProfileContent from '@/components/content/settings/ProfileContent'
import { companies, db, shifts, users } from '@/lib/db'

export default async function ProfilePage() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const [userRow] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)
  // Read-only facts about the account, the same ones the user detail page shows.
  const [companyRow] = userRow?.companyId ? await db.select({ name: companies.name }).from(companies).where(eq(companies.id, userRow.companyId)).limit(1) : []
  const [shiftRow] = userRow?.shiftId ? await db.select().from(shifts).where(eq(shifts.id, userRow.shiftId)).limit(1) : []
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
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
        default_job_type: userRow.defaultJobType ?? null,
        account: {
          id: userRow.id,
          role: userRow.role,
          status: userRow.status,
          is_email_verified: !!userRow.isEmailVerified,
          company_name: companyRow?.name ?? null,
          shift: shiftRow ? { title: shiftRow.title, start: String(shiftRow.startTime).slice(0, 5), end: String(shiftRow.endTime).slice(0, 5) } : null,
          joined_at: userRow.joinedAt ?? null,
          left_at: userRow.leftAt ?? null,
          created_at: iso(userRow.createdAt),
          updated_at: iso(userRow.updatedAt),
          last_login_at: iso(userRow.lastLoginAt),
          last_active_at: iso(userRow.lastActiveAt),
        },
      }
    : undefined

  const displayName =
    (userRow?.fullName && String(userRow.fullName).trim()) ||
    session.user.name ||
    session.user.email ||
    'User'
  const displayAvatar = userRow?.avatarUrl ?? session.user.image ?? null

  return (
    <ProfileContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        name: displayName,
        image: displayAvatar,
        user_metadata: { full_name: displayName, avatar_url: displayAvatar },
      }}
      userData={userData}
    />
  )
}

