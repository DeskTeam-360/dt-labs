import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TeamPoolContent from '@/components/content/ticket/TeamPoolContent'
import { isAdmin } from '@/lib/auth-utils'

export default async function TeamPoolPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  // Admin only for now.
  if (!isAdmin((session.user as { role?: string }).role)) {
    redirect('/dashboard')
  }
  return <TeamPoolContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
