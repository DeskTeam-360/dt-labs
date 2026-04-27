import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketPrioritiesContent from '@/components/content/ticket/TicketPrioritiesContent'

export default async function TicketPrioritiesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <TicketPrioritiesContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
        role: (session.user as { role?: string }).role,
      }}
    />
  )
}
