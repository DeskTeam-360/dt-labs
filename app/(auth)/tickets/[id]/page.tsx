import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getTicketDetail } from '@/lib/ticket-detail'
import TicketDetailContent from '@/components/TicketDetailContent'
import { db } from '@/lib/db'
import { users, companyUsers } from '@/lib/db'
import { eq } from 'drizzle-orm'

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

  const role = (session.user as { role?: string }).role?.toLowerCase()
  let customerCompanyId: string | undefined
  if (role === 'customer' && session.user.id) {
    const userId = session.user.id
    const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
    let cid = userRow?.companyId ?? null
    if (!cid) {
      const [cu] = await db
        .select({ companyId: companyUsers.companyId })
        .from(companyUsers)
        .where(eq(companyUsers.userId, userId))
        .limit(1)
      cid = cu?.companyId ?? null
    }
    if (!cid) {
      redirect('/tickets')
    }
    customerCompanyId = cid
  }

  const data = await getTicketDetail(ticketId, {
    screenshotUserId: session.user.id,
    ...(customerCompanyId ? { companyId: customerCompanyId } : {}),
  })

  if (!data) {
    redirect('/tickets')
  }

  const isCustomer = role === 'customer'
  const commentsForView = isCustomer
    ? data.comments.filter((c: { visibility?: string }) => c.visibility !== 'note')
    : data.comments

  return (
    <TicketDetailContent
      user={session.user}
      ticketData={data.ticketData}
      checklistItems={data.checklistItems}
      comments={commentsForView}
      attributes={data.attributes}
      screenshots={data.screenshots}
      tags={data.tags}
      ticketCcEmails={data.ticketCcEmails ?? []}
      variant={isCustomer ? 'customer' : 'admin'}
    />
  )
}
