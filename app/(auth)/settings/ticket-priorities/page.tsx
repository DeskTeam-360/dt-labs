import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TicketPrioritiesContent from '@/components/content/TicketPrioritiesContent'

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
