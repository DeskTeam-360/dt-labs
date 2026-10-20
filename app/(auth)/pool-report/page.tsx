import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import PoolReportContent from '@/components/content/customer/PoolReportContent'
import { canAccessCustomerTimeReport } from '@/lib/auth-utils'

export default async function PoolReportPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!canAccessCustomerTimeReport(role)) {
    redirect('/dashboard')
  }
  return <PoolReportContent user={session.user} />
}
