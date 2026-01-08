import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import ChangePasswordContent from '@/components/ChangePasswordContent'

export default async function ChangePasswordPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  return <ChangePasswordContent user={user} />
}



