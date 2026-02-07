import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ContentPlannerDetailContent from '@/components/ContentPlannerDetailContent'

export default async function ContentPlannerDetailPage({
  params,
}: {
  params: Promise<{ id: string; plannerId: string }>
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (!currentUser) {
    redirect('/login')
  }

  const { id: companyId, plannerId } = await params

  const { data: companyData, error: companyError } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single()

  if (companyError || !companyData) {
    redirect('/companies')
  }

  const { data: plannerData, error: plannerError } = await supabase
    .from('company_content_planners')
    .select(`
      *,
      channel:content_planner_channels(id, title),
      format:content_planner_formats(id, title)
    `)
    .eq('id', plannerId)
    .eq('company_id', companyId)
    .single()

  if (plannerError || !plannerData) {
    redirect(`/companies/${companyId}`)
  }

  const [intentsRes, formatsRes, channelsRes, aiTemplatesRes] = await Promise.all([
    supabase.from('content_planner_intents').select('id, title').order('title'),
    supabase.from('content_planner_formats').select('id, title').order('title'),
    supabase.from('content_planner_channels').select('id, title').order('title'),
    supabase.from('company_ai_system_template').select('id, title').order('title'),
  ])

  const intents = intentsRes.data || []
  const formats = formatsRes.data || []
  const channels = channelsRes.data || []
  const aiSystemTemplates = (aiTemplatesRes.data || []) as { id: string; title: string }[]

  return (
    <ContentPlannerDetailContent
      user={currentUser}
      companyData={companyData}
      plannerData={plannerData}
      intents={intents}
      formats={formats}
      channels={channels}
      aiSystemTemplates={aiSystemTemplates}
    />
  )
}
