import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import SkillsContent from '@/components/content/settings/SkillsContent'
import { canAccessTeams } from '@/lib/auth-utils'

export default async function SkillsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  if (!canAccessTeams((session.user as { role?: string }).role)) {
    redirect('/settings')
  }
  return <SkillsContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
