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

  // Fetch screenshots with todo info
  const { data: screenshots, error } = await supabase
    .from('screenshots')
    .select(`
      *,
      todos (
        id,
        title,
        status
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Fetch todos for integration
  const { data: todos } = await supabase
    .from('todos')
    .select('id, title, status, due_date')
    .order('created_at', { ascending: false })
    .limit(100)

  return <ScreenshotsContent user={user} screenshots={screenshots || []} todos={todos || []} />
}
