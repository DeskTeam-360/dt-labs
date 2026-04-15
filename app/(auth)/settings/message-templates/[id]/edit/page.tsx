import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import MessageTemplateEditContent from '@/components/content/MessageTemplateEditContent'
import { canAccessMessageTemplates } from '@/lib/auth-utils'

export default async function MessageTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role
  if (!canAccessMessageTemplates(role)) {
    redirect('/dashboard')
  }

  const { id } = await params
  if (!id) redirect('/settings/message-templates')

  return (
    <MessageTemplateEditContent
      templateId={id}
      user={{
        id: session.user.id!,
        email: session.user.email ?? null,
        user_metadata: { full_name: session.user.name },
        role,
      }}
    />
  )
}
