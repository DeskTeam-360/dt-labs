import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import ProfileContent from '@/components/ProfileContent'

export default async function ProfilePage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Fetch user data from users table
  const { data: userData, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return <ProfileContent user={user} userData={userData} />
}

