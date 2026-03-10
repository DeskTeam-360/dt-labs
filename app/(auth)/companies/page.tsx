import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CompaniesContent from '@/components/CompaniesContent'

export default async function CompaniesPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  return <CompaniesContent user={session.user} />
}

