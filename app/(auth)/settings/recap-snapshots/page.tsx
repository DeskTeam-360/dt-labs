import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import RecapSnapshotsSettingsContent from '@/components/content/RecapSnapshotsSettingsContent'
import { canAccessRecapSnapshots } from '@/lib/auth-utils'

export default async function RecapSnapshotsSettingsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessRecapSnapshots(role)) {
    redirect('/settings')
  }
  return <RecapSnapshotsSettingsContent user={session.user} />
}
