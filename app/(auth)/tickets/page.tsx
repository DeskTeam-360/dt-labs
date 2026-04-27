import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { auth } from '@/auth'
import TicketsContent from '@/components/content/ticket/TicketsContent'

export default async function TicketsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}>Loading…</div>}>
      <TicketsContent user={session.user} />
    </Suspense>
  )
}
