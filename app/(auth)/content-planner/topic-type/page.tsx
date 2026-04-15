import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ContentPlannerTopicTypesContent from '@/components/content/ContentPlannerTopicTypesContent'

export default async function ContentPlannerTopicTypePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <ContentPlannerTopicTypesContent user={session.user} />
}
