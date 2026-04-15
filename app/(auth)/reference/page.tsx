import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TicketReferenceContent from '@/components/content/TicketReferenceContent'
import { canAccessTickets } from '@/lib/auth-utils'

export default async function ReferencePage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessTickets(role)) {
    redirect('/dashboard')
  }
  return <TicketReferenceContent user={session.user} />
}
