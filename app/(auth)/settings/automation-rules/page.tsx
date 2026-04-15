import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import AutomationRulesContent from '@/components/content/AutomationRulesContent'
import { canAccessAutomationRules } from '@/lib/auth-utils'

export default async function AutomationRulesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role
  if (!canAccessAutomationRules(role)) {
    redirect('/dashboard')
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
