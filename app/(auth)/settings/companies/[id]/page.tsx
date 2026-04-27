import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CompanyDetailContent from '@/components/content/company/CompanyDetailContent'
import { getCompanyDetail } from '@/lib/company-detail'

export default async function SettingsCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params

  const companyData = await getCompanyDetail(id)
  if (!companyData) {
    redirect('/settings/companies')
  }

  const currentUserRole = (session.user as { role?: string }).role

  return (
    <CompanyDetailContent
      user={session.user}
      companyData={companyData}
      currentUserRole={currentUserRole}
    />
  )
}
