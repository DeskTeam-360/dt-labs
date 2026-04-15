import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ContentPlannerIntentsContent from '@/components/content/ContentPlannerIntentsContent'

export default async function ContentPlannerIntentsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <ContentPlannerIntentsContent user={session.user} />
}
