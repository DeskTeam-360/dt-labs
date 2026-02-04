import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CompanyAISystemTemplatesContent from '@/components/CompanyAISystemTemplatesContent'

export default async function CompanyAISystemTemplatesPage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <CompanyAISystemTemplatesContent user={user} />
}
