import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import MyMenuContent from '@/components/content/settings/MyMenuContent'

export default async function MyMenuPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  // Customers keep their fixed menu.
  if (role === 'customer') redirect('/dashboard')
  return <MyMenuContent user={session.user as { id: string; email?: string | null; name?: string | null; role?: string | null }} />
}
