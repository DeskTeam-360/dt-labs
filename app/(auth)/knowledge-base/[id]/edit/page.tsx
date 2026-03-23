import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db, knowledgeBaseArticles } from '@/lib/db'
import { eq } from 'drizzle-orm'
import KnowledgeBaseArticleForm from '@/components/KnowledgeBaseArticleForm'

export default async function KnowledgeBaseEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id } = await params

  const [row] = await db
    .select()
    .from(knowledgeBaseArticles)
    .where(eq(knowledgeBaseArticles.id, id))
    .limit(1)

  if (!row) {
    redirect('/knowledge-base')
  }

  const initialValues = {
    title: row.title,
    status: row.status,
    description: row.description ?? '',
    category: row.category ?? 'general',
    sort_order: row.sortOrder ?? 0,
  }

  return (
    <KnowledgeBaseArticleForm
      user={session.user}
      articleId={id}
      initialValues={initialValues}
    />
  )
}
