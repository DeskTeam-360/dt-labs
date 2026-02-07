import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CustomerDashboardContent from '@/components/CustomerDashboardContent'

export default async function CustomerPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser()

  if (!currentUser) {
    redirect('/login')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', currentUser.id)
    .single()

  const companyId = userData?.company_id
  if (!companyId) {
    redirect('/dashboard')
  }

  return (
    <CustomerDashboardContent
      user={currentUser}
      companyId={companyId}
    />
  )
}
