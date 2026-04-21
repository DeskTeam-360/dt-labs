import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CustomerWeeklyRecapSettingsContent from '@/components/content/CustomerWeeklyRecapSettingsContent'
import { canAccessCustomerWeeklyRecap } from '@/lib/auth-utils'

export default async function CustomerWeeklyRecapSettingsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessCustomerWeeklyRecap(role)) {
    redirect('/settings')
  }
  return <CustomerWeeklyRecapSettingsContent user={session.user} />
}
