import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import MaintenanceTemplatesContent from '@/components/content/maintenance/MaintenanceTemplatesContent'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Maintenance report templates' }

export default async function MaintenanceTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (!['admin', 'operations'].includes(role)) redirect('/dashboard')
  return <MaintenanceTemplatesContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
