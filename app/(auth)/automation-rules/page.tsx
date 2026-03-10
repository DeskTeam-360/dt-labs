import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import AutomationRulesContent from '@/components/AutomationRulesContent'

export default async function AutomationRulesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <AutomationRulesContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
      }}
    />
  )
}
