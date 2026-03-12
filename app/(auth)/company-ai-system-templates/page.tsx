import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import CompanyAISystemTemplatesContent from '@/components/CompanyAISystemTemplatesContent'

export default async function CompanyAISystemTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <CompanyAISystemTemplatesContent user={session.user} />
}
