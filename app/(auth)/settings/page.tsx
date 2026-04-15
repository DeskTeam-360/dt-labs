import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import SettingsContent from '@/components/content/SettingsContent'
import { canAccessSettingsHub } from '@/lib/auth-utils'

export default async function SettingsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role
  if (!canAccessSettingsHub(role)) {
    redirect('/dashboard')
  }

  return <SettingsContent user={session.user} />
}
