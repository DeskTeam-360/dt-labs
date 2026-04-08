import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import KnowledgeBaseArticleForm from '@/components/KnowledgeBaseArticleForm'

export default async function KnowledgeBaseCreatePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <KnowledgeBaseArticleForm user={session.user} />
}
