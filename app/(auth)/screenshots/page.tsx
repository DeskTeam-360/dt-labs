import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import ScreenshotsContent from '@/components/ScreenshotsContent'

export default async function ScreenshotsPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Fetch screenshots with ticket info
  const { data: screenshots, error } = await supabase
    .from('screenshots')
    .select(`
      *,
      tickets:tickets (
        id,
        title,
        status
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Fetch tickets for integration
  const { data: todos } = await supabase
    .from('tickets')
    .select('id, title, status, due_date')
    .order('created_at', { ascending: false })
    .limit(100)

  return <ScreenshotsContent user={user} screenshots={screenshots || []} todos={todos || []} />
}
