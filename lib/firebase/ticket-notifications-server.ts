import { inArray } from 'drizzle-orm'

import { db, ticketNotifications, users } from '@/lib/db'

export type TicketNotificationType =
  | 'mention'
  | 'assignee_added'
  | 'new_ticket_assignee'
  | 'new_comment'
  | 'status_changed'

export function diffNewAssignees(beforeIds: string[], afterIds: string[]): string[] {
  const before = new Set(beforeIds)
  return afterIds.filter((id) => id && !before.has(id))
}

/**
 * Customers only receive ticket push notifications when:
 * - status changes, or
 * - someone who is not a customer posted a public reply (`new_comment` from staff/manager/admin).
 * Staff still receive `new_comment` when the actor is a customer (unchanged).
 */
async function filterRecipientsByRoleAndType(
  recipientUserIds: string[],
  type: TicketNotificationType,
  actorRole: string | null | undefined
): Promise<string[]> {
  const actor = (actorRole ?? '').toLowerCase().trim()
  const actorIsCustomer = actor === 'customer'
  if (recipientUserIds.length === 0) return []

  const rows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.id, recipientUserIds))
  const roleById = new Map(rows.map((r) => [r.id, (r.role ?? '').toLowerCase().trim()]))

  return recipientUserIds.filter((id) => {
    const rid = String(id).trim()
    const recipientRole = roleById.get(rid) ?? ''
    const recipientIsCustomer = recipientRole === 'customer'

    if (!recipientIsCustomer) {
      if (type === 'new_comment') {
        return actorIsCustomer
      }
      return true
    }

    if (type === 'status_changed') return true
    if (type === 'new_comment' && !actorIsCustomer) return true
    return false
  })
}

/** Writes one `ticket_notifications` row per recipient. */
export async function notifyTicketUsers(params: {
  recipientUserIds: string[]
  excludeUserId?: string | null
  ticketId: number
  ticketTitle: string
  type: TicketNotificationType
  title: string
  body: string
  actorUserId: string
  actorName: string
  /** Session role of the actor (e.g. customer, admin, manager, staff). Drives customer vs staff routing for `new_comment`. */
  actorRole?: string | null
}): Promise<void> {
  const exclude = params.excludeUserId != null ? String(params.excludeUserId).trim() : ''
  const unique = [...new Set(params.recipientUserIds.map((id) => String(id).trim()))].filter(
    (id) => Boolean(id) && id !== exclude
  )
  if (unique.length === 0) return

  const recipients = await filterRecipientsByRoleAndType(unique, params.type, params.actorRole)
  if (recipients.length === 0) return

  try {
    await db.insert(ticketNotifications).values(
      recipients.map((userId) => ({
        userId,
        ticketId: params.ticketId,
        ticketTitle: (params.ticketTitle || 'Ticket').slice(0, 200),
        type: params.type,
        title: params.title.slice(0, 200),
        body: params.body.slice(0, 500),
        actorUserId: params.actorUserId || null,
        actorName: (params.actorName || 'Someone').slice(0, 200),
      }))
    )
  } catch (e) {
    const cause = (e as { cause?: { message?: string } })?.cause?.message
    console.error('[notifyTicketUsers] insert failed (is migration 071 applied?):', cause ?? (e as Error)?.message)
  }
}
