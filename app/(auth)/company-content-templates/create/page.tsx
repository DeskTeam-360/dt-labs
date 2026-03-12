import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ContentTemplateForm from '@/components/ContentTemplateForm'

export default async function CreateContentTemplatePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <ContentTemplateForm user={session.user} />
}

