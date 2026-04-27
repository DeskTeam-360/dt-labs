import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TeamsContent from '@/components/content/team/TeamsContent'

export default async function SettingsTeamsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <TeamsContent user={session.user} />
}
