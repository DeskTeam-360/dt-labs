import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { canAccessKnowledgeBase } from '@/lib/auth-utils'

export default async function KnowledgeBaseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessKnowledgeBase(role)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
