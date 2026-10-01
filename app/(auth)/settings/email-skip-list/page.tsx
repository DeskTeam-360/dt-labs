import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import EmailSkipListContent from '@/components/content/settings/EmailSkipListContent'
import { canAccessEmailIntegration } from '@/lib/auth-utils'

export default async function EmailSkipListPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canAccessEmailIntegration((session.user as { role?: string }).role)) redirect('/settings')
  return <EmailSkipListContent user={session.user} />
}
