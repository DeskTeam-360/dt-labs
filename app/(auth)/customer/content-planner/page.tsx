import { getCustomerCompanyData } from '@/lib/customer'
import CompanyDetailContent from '@/components/CompanyDetailContent'

export default async function CustomerContentPlannerPage() {
  const { user, companyData } = await getCustomerCompanyData()
  return (
    <CompanyDetailContent
      user={user}
      companyData={companyData}
      variant="customer"
      activeSection="content-planner"
    />
  )
}
