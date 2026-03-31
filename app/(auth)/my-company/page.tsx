import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CustomerCompanySettingsContent from '@/components/CustomerCompanySettingsContent'
import { getCustomerCompanyId, isCompanyPortalAdmin } from '@/lib/customer-company'
import { getCompanyDetail } from '@/lib/company-detail'

export default async function MyCompanyPage() {
  const session = await auth()
  if (!session?.user?.id) {
    redirect('/login')
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role !== 'customer') {
    redirect('/dashboard')
  }

  const companyId = await getCustomerCompanyId(session.user.id)
  if (!companyId) {
    redirect('/dashboard')
  }

  const companyData = await getCompanyDetail(companyId)
  if (!companyData) {
    redirect('/dashboard')
  }

  const portalAdmin = await isCompanyPortalAdmin(session.user.id, companyId)

  return (
    <CustomerCompanySettingsContent
      user={session.user}
      companyData={companyData}
      isCompanyPortalAdmin={portalAdmin}
    />
  )
}
