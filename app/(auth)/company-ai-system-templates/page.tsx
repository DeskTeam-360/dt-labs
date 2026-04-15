import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import CompanyAISystemTemplatesContent from '@/components/content/CompanyAISystemTemplatesContent'

export default async function CompanyAISystemTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <CompanyAISystemTemplatesContent user={session.user} />
}
