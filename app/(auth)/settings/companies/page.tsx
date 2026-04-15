import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CompaniesContent from '@/components/content/CompaniesContent'

export default async function SettingsCompaniesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  return <CompaniesContent user={session.user} />
}
