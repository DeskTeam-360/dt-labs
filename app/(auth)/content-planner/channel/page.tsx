import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ContentPlannerChannelsContent from '@/components/ContentPlannerChannelsContent'

export default async function ContentPlannerChannelPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <ContentPlannerChannelsContent user={user} />
}
