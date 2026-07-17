import { and, eq, inArray, isNull, not, or, type SQL } from 'drizzle-orm'

import { getCustomerCompanyId } from '@/lib/customer-company'
import { db, tickets } from '@/lib/db'
import { coerceTicketType } from '@/lib/ticket-classification'
import {
  isTicketVisibilityLevel,
  TICKET_VISIBILITY_LEVELS,
  userMatchesVisibilityRule,
} from '@/lib/ticket-visibility'
import { getTicketVisibilityRules } from '@/lib/ticket-visibility-server'

export type CustomerTicketRow = {
  companyId: string | null
  contactUserId: string | null
  createdBy: string | null
  visibility?: string | null
}

/** Ticket without company: contact or creator. */
export function customerOwnsPersonalTicket(ticket: CustomerTicketRow, userId: string): boolean {
  return ticket.contactUserId === userId || ticket.createdBy === userId
}

/** Whether a visibility value is allowed for the customer role under current rules. */
export async function customerMaySeeVisibility(visibility: string | null | undefined): Promise<boolean> {
  if (!visibility) return true
  if (!isTicketVisibilityLevel(visibility)) {
    // Legacy public/private/specific_users — company/ownership still gates access
    return true
  }
  const rules = await getTicketVisibilityRules()
  return userMatchesVisibilityRule(
    { role: 'customer', department: null, position: null },
    rules[visibility]
  )
}

/** Customer portal may see company tickets or personal ones (company null). */
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

/** Visibility levels the customer role must not see (from configured rules). */
export async function customerBlockedVisibilityLevels(): Promise<string[]> {
  const rules = await getTicketVisibilityRules()
  return TICKET_VISIBILITY_LEVELS.filter(
    (level) =>
      !userMatchesVisibilityRule({ role: 'customer', department: null, position: null }, rules[level])
  )
}

/** SQL condition for the customer ticket list. */
export async function customerTicketsAccessCondition(
  userId: string,
  customerCompanyId: string | null
): Promise<SQL> {
  const personalOwned = and(
    isNull(tickets.companyId),
    or(eq(tickets.contactUserId, userId), eq(tickets.createdBy, userId))!
  )!
  const scope = customerCompanyId
    ? or(eq(tickets.companyId, customerCompanyId), personalOwned)!
    : personalOwned

  const blocked = await customerBlockedVisibilityLevels()
  if (blocked.length === 0) return scope
  return and(scope, not(inArray(tickets.visibility, blocked)))!
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
      visibility: tickets.visibility,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1)
  if (!trow) return { ok: false, status: 404 }
  if (!customerCanAccessTicket(trow, userId, customerCompanyId)) {
    return { ok: false, status: 403 }
  }
  if (!(await customerMaySeeVisibility(trow.visibility))) {
    return { ok: false, status: 403 }
  }
  const cls = coerceTicketType(trow.ticketType)
  if (cls === 'spam' || cls === 'trash' || cls === 'project') {
    return { ok: false, status: 403 }
  }
  return { ok: true }
}
