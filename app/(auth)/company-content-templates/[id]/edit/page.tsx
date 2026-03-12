import { auth } from '@/auth'
import { db, companyContentTemplates } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import ContentTemplateForm from '@/components/ContentTemplateForm'

export default async function EditContentTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const [row] = await db.select().from(companyContentTemplates).where(eq(companyContentTemplates.id, id)).limit(1)

  if (!row) redirect('/company-content-templates')

  const template = {
    id: row.id,
    title: row.title,
    content: row.content,
    description: row.description,
    fields: row.fields,
    type: row.type,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }

  return <ContentTemplateForm user={session.user} template={template} />
}

