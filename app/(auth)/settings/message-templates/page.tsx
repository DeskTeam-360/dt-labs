import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import MessageTemplatesContent from '@/components/content/MessageTemplatesContent'
import { canAccessMessageTemplates } from '@/lib/auth-utils'

export default async function MessageTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessMessageTemplates(role)) {
    redirect('/dashboard')
  }

  return (
    <MessageTemplatesContent
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
        role,
      }}
    />
  )
}
