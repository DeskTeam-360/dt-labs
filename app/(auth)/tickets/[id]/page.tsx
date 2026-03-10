import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getTicketDetail } from '@/lib/ticket-detail'
import TicketDetailContent from '@/components/TicketDetailContent'

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    redirect('/tickets')
  }

  const data = await getTicketDetail(ticketId, {
    screenshotUserId: session.user.id,
  })

  if (!data) {
    redirect('/tickets')
  }

  return (
    <TicketDetailContent
      user={session.user}
      ticketData={data.ticketData}
      checklistItems={data.checklistItems}
      comments={data.comments}
      attributes={data.attributes}
      screenshots={data.screenshots}
      tags={data.tags}
    />
  )
}
