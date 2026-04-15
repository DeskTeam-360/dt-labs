import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { canAccessTickets } from '@/lib/auth-utils'

export default async function TicketActivityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessTickets(role)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
