import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db, users } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { getTicketDetail } from '@/lib/ticket-detail'
import TicketDetailContent from '@/components/TicketDetailContent'

export default async function CustomerTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const [userRow] = await db
    .select({ companyId: users.companyId })
    .from(users)
    .where(eq(users.id, session.user.id))

  const companyId = userRow?.companyId
  if (!companyId) {
    redirect('/dashboard')
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    redirect('/customer')
  }

  const data = await getTicketDetail(ticketId, {
    companyId,
    screenshotUserId: session.user.id,
  })

  if (!data) {
    redirect('/customer')
  }

  // Customer view: filter comments to reply only
  const comments = data.comments.filter((c) => c.visibility === 'reply')

  return (
    <TicketDetailContent
      user={session.user}
      ticketData={data.ticketData}
      checklistItems={data.checklistItems}
      comments={comments}
      attributes={data.attributes}
      screenshots={data.screenshots}
      tags={data.tags}
      variant="customer"
    />
  )
}
