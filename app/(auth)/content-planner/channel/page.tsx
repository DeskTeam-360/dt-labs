import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ContentPlannerChannelsContent from '@/components/content/ContentPlannerChannelsContent'

export default async function ContentPlannerChannelPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <ContentPlannerChannelsContent user={session.user} />
}
