import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import KnowledgeBaseContent from '@/components/content/knowledge-base/KnowledgeBaseContent'

export default async function KnowledgeBasePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <KnowledgeBaseContent user={session.user} />
}
