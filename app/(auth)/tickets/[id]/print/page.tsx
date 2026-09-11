import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketPrintView from '@/components/ticket/TicketPrintView'
import { db, tickets } from '@/lib/db'
import { getTicketDetail } from '@/lib/ticket-detail'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) return {}
  const [row] = await db.select({ title: tickets.title }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!row) return {}
  return { title: `Print #${ticketId} ${row.title}` }
}

export default async function TicketPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) redirect('/tickets?ticket_error=invalid')

  const data = await getTicketDetail(ticketId, { screenshotUserId: session.user.id! })
  if (!data) redirect('/tickets?ticket_error=no_access')

  return <TicketPrintView ticketData={data.ticketData} comments={data.comments} />
}
