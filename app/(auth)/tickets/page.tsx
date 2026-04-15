import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import TicketsContent from '@/components/content/TicketsContent'

export default async function TicketsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return <TicketsContent user={session.user} />
}
