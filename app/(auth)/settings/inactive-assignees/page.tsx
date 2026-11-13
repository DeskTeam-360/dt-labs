import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import InactiveAssigneesContent from '@/components/content/settings/InactiveAssigneesContent'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Tickets with inactive assignees' }

export default async function InactiveAssigneesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'operations'].includes(role)) redirect('/dashboard')
  return <InactiveAssigneesContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
