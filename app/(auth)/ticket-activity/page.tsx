import { auth } from '@/auth'
import TicketActivityHistoryContent from '@/components/TicketActivityHistoryContent'

export default async function TicketActivityPage() {
  const session = await auth()
  const user = session?.user
  if (!user) return null
  return (
    <TicketActivityHistoryContent
      user={{
        id: user.id!,
        email: user.email,
        name: user.name,
        role: (user as { role?: string }).role,
      }}
    />
  )
}
