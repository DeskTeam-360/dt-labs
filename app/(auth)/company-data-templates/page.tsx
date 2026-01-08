import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CompanyDataTemplatesContent from '@/components/CompanyDataTemplatesContent'

export default async function CompanyDataTemplatesPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <CompanyDataTemplatesContent user={user} />
}

