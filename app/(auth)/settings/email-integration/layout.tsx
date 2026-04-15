import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { canAccessEmailIntegration } from '@/lib/auth-utils'

export default async function EmailIntegrationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessEmailIntegration(role)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
