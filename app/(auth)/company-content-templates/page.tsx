import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CompanyContentTemplatesContent from '@/components/CompanyContentTemplatesContent'

export default async function CompanyContentTemplatesPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <CompanyContentTemplatesContent user={user} />
}

