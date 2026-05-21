import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import JobTypesCatalogAdminContent from '@/components/content/settings/JobTypesCatalogAdminContent'
import { isAdmin } from '@/lib/auth-utils'

export default async function SettingsJobTypesCatalogPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) {
    redirect('/settings')
  }
  return <JobTypesCatalogAdminContent user={session.user} />
}
