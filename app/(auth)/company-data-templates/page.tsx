import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CompanyDataTemplatesContent from '@/components/content/CompanyDataTemplatesContent'

export default async function CompanyDataTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <CompanyDataTemplatesContent user={session.user} />
}

