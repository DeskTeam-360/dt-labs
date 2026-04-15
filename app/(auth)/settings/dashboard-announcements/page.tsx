import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import DashboardAnnouncementsSettingsContent from '@/components/content/DashboardAnnouncementsSettingsContent'
import { isAdmin } from '@/lib/auth-utils'

export default async function DashboardAnnouncementsSettingsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) {
    redirect('/settings')
  }
  return <DashboardAnnouncementsSettingsContent user={session.user} />
}
