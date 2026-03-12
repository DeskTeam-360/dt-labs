import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TeamsContent from '@/components/TeamsContent'

export default async function TeamsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <TeamsContent user={session.user} />
}
