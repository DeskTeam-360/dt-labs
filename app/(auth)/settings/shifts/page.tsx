import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import ShiftsContent from '@/components/content/settings/ShiftsContent'
import { isAdmin } from '@/lib/auth-utils'

export default async function ShiftsPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  // Admin only.
  if (!isAdmin((session.user as { role?: string }).role)) {
    redirect('/settings')
  }
  return <ShiftsContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
