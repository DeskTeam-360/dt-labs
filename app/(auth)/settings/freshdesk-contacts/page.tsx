import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import FreshdeskContactsContent from '@/components/content/settings/FreshdeskContactsContent'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Freshdesk Contacts — No Company' }

export default async function FreshdeskContactsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role !== 'admin') redirect('/settings')

  return <FreshdeskContactsContent />
}
