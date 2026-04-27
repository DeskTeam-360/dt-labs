import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketTypesContent from '@/components/content/ticket/TicketTypesContent'

export default async function TicketTypesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <TicketTypesContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
      }}
    />
  )
}
