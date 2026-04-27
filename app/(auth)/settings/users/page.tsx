import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import UsersContent from '@/components/content/user/UsersContent'
import { canAccessUsers } from '@/lib/auth-utils'

export default async function SettingsUsersPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role
  if (!canAccessUsers(role)) {
    redirect('/dashboard')
  }

  return <UsersContent user={session.user} />
}
