import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { canAccessTeams } from '@/lib/auth-utils'

export default async function SettingsTeamsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessTeams(role)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
