import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import KnowledgeBaseArticleForm from '@/components/KnowledgeBaseArticleForm'

export default async function KnowledgeBaseEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id } = await params
  return <KnowledgeBaseArticleForm user={session.user} articleId={id} />
}
