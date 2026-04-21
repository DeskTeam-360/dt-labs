import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CompanyLogSettingsContent from '@/components/content/CompanyLogSettingsContent'
import { canAccessCompanyLog } from '@/lib/auth-utils'

export default async function CompanyLogSettingsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessCompanyLog(role)) {
    redirect('/settings')
  }
  return <CompanyLogSettingsContent user={session.user} />
}
