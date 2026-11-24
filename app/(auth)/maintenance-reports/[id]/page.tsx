import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import MaintenanceReportContent from '@/components/content/maintenance/MaintenanceReportContent'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Website maintenance report' }

export default async function MaintenanceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (((session.user as { role?: string }).role ?? '').toLowerCase() === 'customer') redirect('/dashboard')
  const { id } = await params
  return <MaintenanceReportContent reportId={id} user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
