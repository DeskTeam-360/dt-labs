import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TeamsContent from '@/components/content/TeamsContent'

export default async function SettingsTeamsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <TeamsContent user={session.user} />
}
