import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ContentTemplateForm from '@/components/ContentTemplateForm'

export default async function EditContentTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { id } = await params

  // Fetch template data
  const { data: template, error } = await supabase
    .from('company_content_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !template) {
    redirect('/company-content-templates')
  }

  return <ContentTemplateForm user={user} template={template} />
}

