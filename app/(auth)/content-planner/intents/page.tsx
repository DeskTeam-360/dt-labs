import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import ContentPlannerIntentsContent from '@/components/ContentPlannerIntentsContent'

export default async function ContentPlannerIntentsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <ContentPlannerIntentsContent user={user} />
}
