import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { auth } from '@/auth'
import TicketsContent from '@/components/content/ticket/TicketsContent'

/** Same as All tickets, but only the tickets assigned to the signed-in person. */
export default async function MyTicketsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = ((session.user as { role?: string }).role ?? '').toLowerCase()
  if (role === 'customer') redirect('/tickets')

  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: 'center' }}>Loading…</div>}>
      <TicketsContent user={session.user} mineOnly />
    </Suspense>
  )
}
