import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CompanyDetailContent from '@/components/CompanyDetailContent'

export default async function CompanyDetailPage({
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

  // Fetch company data with related information
  const { data: companyData, error } = await supabase
    .from('companies')
    .select(`
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
    `)
    .eq('id', id)
    .single()

  if (error || !companyData) {
    redirect('/companies')
  }

  return <CompanyDetailContent user={currentUser} companyData={companyData} />
}

