import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import MyTeamsContent from '@/components/MyTeamsContent'
import { canAccessMyTeams } from '@/lib/auth-utils'

export default async function MyTeamsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessMyTeams(role)) {
    redirect('/dashboard')
  }
  return <MyTeamsContent user={session.user} />
}
