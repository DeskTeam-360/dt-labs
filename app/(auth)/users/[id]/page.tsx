import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import UserDetailContent from '@/components/UserDetailContent'

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (!currentUser) {
    redirect('/login')
  }

  // Await params since it's a Promise in Next.js 15+
  const { id } = await params

  // Fetch user data with company
  const { data: userData, error } = await supabase
    .from('users')
    .select(`
      *,
      company:companies!users_company_id_fkey(id, name)
    `)
    .eq('id', id)
    .single()

  if (error || !userData) {
    redirect('/users')
  }

  return <UserDetailContent user={currentUser} userData={userData} />
}

