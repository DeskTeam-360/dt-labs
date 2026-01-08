import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import DashboardContent from '@/components/DashboardContent'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null // Layout akan handle redirect
  }

  return <DashboardContent user={user} />
}

