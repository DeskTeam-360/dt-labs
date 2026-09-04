import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { auth } from '@/auth'
import ChecklistTemplatesContent from '@/components/content/settings/ChecklistTemplatesContent'
import { canAccessChecklistTemplates } from '@/lib/auth-utils'

export default async function ChecklistTemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role ?? ''
  if (!canAccessChecklistTemplates(role)) redirect('/settings')
  return (
    <Suspense>
      <ChecklistTemplatesContent user={session.user} />
    </Suspense>
  )
}
