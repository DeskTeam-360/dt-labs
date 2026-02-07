import { getCustomerCompanyData } from '@/lib/customer'
import CompanyDetailContent from '@/components/CompanyDetailContent'

export default async function CustomerWebsitesPage() {
  const { user, companyData } = await getCustomerCompanyData()
  return (
    <CompanyDetailContent
      user={user}
      companyData={companyData}
      variant="customer"
      activeSection="websites"
    />
  )
}
