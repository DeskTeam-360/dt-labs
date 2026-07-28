import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CompaniesContent from '@/components/content/company/CompaniesContent'

export const dynamic = 'force-dynamic'

export default async function SettingsCompaniesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  return <CompaniesContent user={session.user} />
}
