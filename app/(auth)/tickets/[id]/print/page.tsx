import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TicketPrintView from '@/components/ticket/TicketPrintView'
import { db, tickets, users } from '@/lib/db'
import { getTicketDetail } from '@/lib/ticket-detail'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) return {}
  const [row] = await db.select({ title: tickets.title }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!row) return {}
  const now = new Date()
  const ts = now.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\//g, '-').replace(',', '')
  return { title: { absolute: `Print #${ticketId} ${row.title} - DeskTeam360 - ${ts}` } }
}

export default async function TicketPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (Number.isNaN(ticketId)) redirect('/tickets?ticket_error=invalid')

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const isCustomer = role === 'customer'

  // Customers see filtered view (no internal notes)
  const [userRow] = isCustomer
    ? await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, session.user.id!)).limit(1)
    : [null]

  const options = isCustomer
    ? { customerPortal: { userId: session.user.id!, companyId: (userRow as { companyId: string | null } | null)?.companyId ?? null }, screenshotUserId: session.user.id! }
    : { screenshotUserId: session.user.id! }

  const data = await getTicketDetail(ticketId, options)
  if (!data) redirect('/tickets?ticket_error=no_access')

  return <TicketPrintView ticketData={data.ticketData} comments={data.comments} isAgent={!isCustomer} />
}
