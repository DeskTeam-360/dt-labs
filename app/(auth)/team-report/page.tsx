import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TeamReportContent from '@/components/content/customer/TeamReportContent'
import { canAccessTeams } from '@/lib/auth-utils'

export default async function TeamReportPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessTeams(role)) {
    redirect('/dashboard')
  }
  return <TeamReportContent user={session.user} />
}
