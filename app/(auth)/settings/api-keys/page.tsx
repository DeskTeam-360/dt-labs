import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ApiKeysContent from '@/components/content/settings/ApiKeysContent'
import { isAdmin } from '@/lib/auth-utils'

export default async function ApiKeysPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // Admins see every connection here; everyone else manages their own in the profile.
  if (!isAdmin((session.user as { role?: string }).role)) redirect('/profile')
  return <ApiKeysContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
