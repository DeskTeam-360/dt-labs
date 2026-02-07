import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const COMPANY_SELECT = `
  *,
  company_datas (
    id,
    value,
    created_at,
    updated_at,
    company_data_templates (
      id,
      title,
      group
    )
  ),
  company_users (
    user_id,
    created_at,
    users (
      id,
      full_name,
      email
    )
  ),
  company_websites (
    id,
    url,
    title,
    description,
    is_primary,
    created_at,
    updated_at
  )
`

export async function getCustomerCompanyData() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: userData } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const companyId = userData?.company_id
  if (!companyId) {
    redirect('/dashboard')
  }

  const { data: companyData, error } = await supabase
    .from('companies')
    .select(COMPANY_SELECT)
    .eq('id', companyId)
    .single()

  if (error || !companyData) {
    redirect('/dashboard')
  }

  return { user, companyData }
}
