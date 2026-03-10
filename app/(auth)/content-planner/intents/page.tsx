import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ContentPlannerIntentsContent from '@/components/ContentPlannerIntentsContent'

export default async function ContentPlannerIntentsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <ContentPlannerIntentsContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
      }}
    />
  )
}
