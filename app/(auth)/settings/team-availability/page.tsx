import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TeamAvailabilityContent from '@/components/content/settings/TeamAvailabilityContent'
import { canManageTeamAvailability } from '@/lib/auth-utils'

export default async function TeamAvailabilityPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!canManageTeamAvailability(role)) {
    redirect('/settings')
  }
  return <TeamAvailabilityContent user={session.user} />
}
