import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { auth } from '@/auth'
import ChecklistTemplatesContent from '@/components/content/settings/ChecklistTemplatesContent'

export default async function ChecklistTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role ?? ''
  if (role.toLowerCase() !== 'admin') redirect('/settings')
  return (
    <Suspense>
      <ChecklistTemplatesContent user={session.user} />
    </Suspense>
  )
}
