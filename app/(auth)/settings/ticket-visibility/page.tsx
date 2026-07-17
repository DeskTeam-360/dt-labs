import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketVisibilityContent from '@/components/content/settings/TicketVisibilityContent'
import { canAccessTicketVisibilitySettings } from '@/lib/auth-utils'

export const metadata = { title: 'Ticket Visibility' }

export default async function TicketVisibilityPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (!canAccessTicketVisibilitySettings(role)) redirect('/settings')

  return <TicketVisibilityContent user={session.user} />
}
