import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ApiKeysContent from '@/components/content/settings/ApiKeysContent'
import { canManageApiKeys } from '@/lib/auth-utils'

export default async function ApiKeysPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!canManageApiKeys((session.user as { role?: string }).role)) redirect('/settings')
  return <ApiKeysContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
