import { and, eq, isNull, or, type SQL } from 'drizzle-orm'

import { getCustomerCompanyId } from '@/lib/customer-company'
import { db, tickets } from '@/lib/db'
import { coerceTicketType } from '@/lib/ticket-classification'

export type CustomerTicketRow = {
  companyId: string | null
  contactUserId: string | null
  createdBy: string | null
}

/** Ticket tanpa company: contact atau creator. */
export function customerOwnsPersonalTicket(ticket: CustomerTicketRow, userId: string): boolean {
  return ticket.contactUserId === userId || ticket.createdBy === userId
}

/** Portal customer boleh lihat ticket perusahaan atau milik pribadi (company null). */
export function customerCanAccessTicket(
  ticket: CustomerTicketRow,
  userId: string,
  customerCompanyId: string | null
): boolean {
  if (ticket.companyId) {
    return customerCompanyId !== null && ticket.companyId === customerCompanyId
  }
  return customerOwnsPersonalTicket(ticket, userId)
}

/** Kondisi SQL untuk daftar ticket customer. */
export function customerTicketsAccessCondition(userId: string, customerCompanyId: string | null): SQL {
  const personalOwned = and(
    isNull(tickets.companyId),
    or(eq(tickets.contactUserId, userId), eq(tickets.createdBy, userId))!
  )!
  if (customerCompanyId) {
    return or(eq(tickets.companyId, customerCompanyId), personalOwned)!
  }
  return personalOwned
}

export async function assertCustomerMayAccessTicket(
  userId: string,
  ticketId: number
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  const customerCompanyId = await getCustomerCompanyId(userId)
  const [trow] = await db
    .select({
      companyId: tickets.companyId,
      contactUserId: tickets.contactUserId,
      createdBy: tickets.createdBy,
      ticketType: tickets.ticketType,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)
  if (!trow) return { ok: false, status: 404 }
  if (!customerCanAccessTicket(trow, userId, customerCompanyId)) {
    return { ok: false, status: 403 }
  }
  const cls = coerceTicketType(trow.ticketType)
  if (cls === 'spam' || cls === 'trash' || cls === 'project') {
    return { ok: false, status: 403 }
  }
  return { ok: true }
}
