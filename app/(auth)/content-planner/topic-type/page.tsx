import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ContentPlannerTopicTypesContent from '@/components/ContentPlannerTopicTypesContent'

export default async function ContentPlannerTopicTypePage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <ContentPlannerTopicTypesContent user={user} />
}
