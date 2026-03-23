import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { canAccessUsers } from '@/lib/auth-utils'

export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessUsers(role)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
