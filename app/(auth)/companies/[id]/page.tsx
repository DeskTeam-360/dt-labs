import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CompanyDetailContent from '@/components/CompanyDetailContent'
import { getCompanyDetail } from '@/lib/company-detail'

export default async function CompanyDetailPage({
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
    redirect('/companies')
  }

  return <CompanyDetailContent user={session.user} companyData={companyData} />
}

