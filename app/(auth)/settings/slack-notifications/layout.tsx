import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { canAccessSlackNotifications } from '@/lib/auth-utils'

export default async function SlackNotificationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessSlackNotifications(role)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
