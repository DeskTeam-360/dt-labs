import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ConnectionStatusContent from '@/components/content/settings/ConnectionStatusContent'
import { isAdmin } from '@/lib/auth-utils'

export default async function ConnectionStatusPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) redirect('/settings')

  return <ConnectionStatusContent user={session.user} />
}
