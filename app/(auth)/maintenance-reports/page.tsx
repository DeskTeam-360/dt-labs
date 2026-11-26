import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import MaintenanceOverviewContent from '@/components/content/maintenance/MaintenanceOverviewContent'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Website maintenance' }

export default async function MaintenanceOverviewPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (((session.user as { role?: string }).role ?? '').toLowerCase() === 'customer') redirect('/dashboard')
  return <MaintenanceOverviewContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
