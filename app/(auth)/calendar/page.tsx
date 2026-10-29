import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CalendarContent from '@/components/content/calendar/CalendarContent'

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (role === 'customer') redirect('/dashboard')
  return <CalendarContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
