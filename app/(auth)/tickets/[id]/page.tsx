import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketDetailContentClient from '@/components/ticket/TicketDetailContentClient'
import { db } from '@/lib/db'
import { companyUsers, tickets, users } from '@/lib/db'
import { getTicketDetail } from '@/lib/ticket-detail'

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
  if (Number.isNaN(ticketId)) {
    redirect('/tickets?ticket_error=invalid')
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
      redirect('/tickets?ticket_error=no_access')
    }
    customerCompanyId = cid
  }

  const [ticketExists] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!ticketExists) {
    redirect('/tickets?ticket_error=not_found')
  }

  const data = await getTicketDetail(ticketId, {
    screenshotUserId: session.user.id,
    ...(customerCompanyId ? { companyId: customerCompanyId } : {}),
  })

  if (!data) {
    redirect('/tickets?ticket_error=no_access')
  }

  const isCustomer = role === 'customer'

  return (
    <TicketDetailContentClient
      user={session.user}
      ticketData={data.ticketData}
      checklistItems={data.checklistItems}
      comments={data.comments}
      commentsHasOlder={data.comments_has_older}
      commentsOlderCursor={data.comments_older_cursor}
      commentsOlderRemaining={data.comments_older_remaining}
      attributes={data.attributes}
      screenshots={data.screenshots}
      tags={data.tags}
      ticketCcEmails={data.ticketCcEmails ?? []}
      variant={isCustomer ? 'customer' : 'admin'}
    />
  )
}

