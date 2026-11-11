import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import WpMonitorContent from '@/components/content/wp-monitor/WpMonitorContent'

export const dynamic = 'force-dynamic'

export default async function WpMonitorPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'operations', 'manager'].includes(role)) redirect('/dashboard')
  return <WpMonitorContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
