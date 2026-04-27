import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketStatusesContent from '@/components/content/ticket/TicketStatusesContent'

export default async function TicketStatusesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <TicketStatusesContent user={session.user} />
}
