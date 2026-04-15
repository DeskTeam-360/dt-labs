import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CompanyContentTemplatesContent from '@/components/content/CompanyContentTemplatesContent'

export default async function CompanyContentTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <CompanyContentTemplatesContent user={session.user} />
}

