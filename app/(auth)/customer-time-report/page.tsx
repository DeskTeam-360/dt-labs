import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CustomerTimeReportContent from '@/components/content/CustomerTimeReportContent'
import { isAdminOrManager } from '@/lib/auth-utils'

export default async function CustomerTimeReportPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  const role = (session.user as { role?: string }).role
  if (!isAdminOrManager(role)) {
    redirect('/dashboard')
  }
  return <CustomerTimeReportContent user={session.user} />
}
