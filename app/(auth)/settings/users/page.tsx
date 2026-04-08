import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import UsersContent from '@/components/UsersContent'
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
