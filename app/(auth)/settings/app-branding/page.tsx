import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import AppBrandingContent from '@/components/content/settings/AppBrandingContent'
import { isAdmin } from '@/lib/auth-utils'

export default async function AppBrandingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (!isAdmin(role)) redirect('/settings')

  return <AppBrandingContent user={{ ...session.user, role: role ?? undefined }} />
}
