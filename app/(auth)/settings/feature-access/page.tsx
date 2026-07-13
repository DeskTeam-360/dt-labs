import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import FeatureAccessContent from '@/components/content/settings/FeatureAccessContent'

export default async function FeatureAccessPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (role === 'customer') redirect('/dashboard')

  return <FeatureAccessContent user={session.user} />
}
