import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import GlobalAnnouncementSettingsContent from '@/components/content/settings/GlobalAnnouncementSettingsContent'
import { isAdmin } from '@/lib/auth-utils'

export default async function GlobalAnnouncementSettingsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) {
    redirect('/settings')
  }
  return <GlobalAnnouncementSettingsContent user={session.user} />
}
