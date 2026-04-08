import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TicketStatusesContent from '@/components/TicketStatusesContent'

export default async function TicketStatusesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <TicketStatusesContent user={session.user} />
}
