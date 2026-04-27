import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import KnowledgeBaseArticleForm from '@/components/knowledge-base/KnowledgeBaseArticleForm'

export default async function KnowledgeBaseCreatePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <KnowledgeBaseArticleForm user={session.user} />
}
