import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import RecurringTicketsContent from '@/components/content/recurring-tickets/RecurringTicketsContent'
import { canAccessRecurringTickets } from '@/lib/auth-utils'

export const metadata = { title: 'Recurring Tickets' }

export default async function RecurringTicketsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (!canAccessRecurringTickets(role)) redirect('/settings')

  return <RecurringTicketsContent user={session.user} />
}
