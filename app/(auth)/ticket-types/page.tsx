import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TicketTypesContent from '@/components/TicketTypesContent'

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
