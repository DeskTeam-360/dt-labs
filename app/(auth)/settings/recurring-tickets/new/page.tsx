import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import RecurringTicketFormPage from '@/components/content/recurring-tickets/RecurringTicketFormPage'

export default async function NewRecurringTicketPage() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role?.toLowerCase()
  if (!session?.user || !['admin', 'manager'].includes(role ?? '')) redirect('/settings/recurring-tickets')

  return <RecurringTicketFormPage initialValues={null} />
}
