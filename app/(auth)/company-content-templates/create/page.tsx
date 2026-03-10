import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ContentTemplateForm from '@/components/ContentTemplateForm'

function toSessionUser(u: { id: string; email?: string | null; name?: string | null; image?: string | null }) {
  return { id: u.id, email: u.email ?? undefined, user_metadata: { full_name: u.name, avatar_url: u.image } }
}

export default async function CreateContentTemplatePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <ContentTemplateForm user={toSessionUser(session.user)} />
}

