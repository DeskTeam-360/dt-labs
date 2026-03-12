import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ContentPlannerTopicTypesContent from '@/components/ContentPlannerTopicTypesContent'

export default async function ContentPlannerTopicTypePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <ContentPlannerTopicTypesContent user={session.user} />
}
