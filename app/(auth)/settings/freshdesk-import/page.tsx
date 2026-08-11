import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import FreshdeskImportContent from '@/components/content/settings/FreshdeskImportContent'
import { appSettings, db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function FreshdeskImportPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const role = (session.user as { role?: string }).role?.toLowerCase()
  if (role !== 'admin') redirect('/settings')

  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']))

  return (
    <FreshdeskImportContent
      user={session.user}
      initialDomain={map['freshdesk_domain'] ?? ''}
      initialApiKey={map['freshdesk_api_key'] ?? ''}
    />
  )
}
