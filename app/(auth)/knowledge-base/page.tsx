import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import KnowledgeBaseContent from '@/components/KnowledgeBaseContent'

export default async function KnowledgeBasePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <KnowledgeBaseContent user={session.user} />
}
