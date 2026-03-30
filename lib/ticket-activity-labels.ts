const ACTION_LABELS: Record<string, string> = {
  ticket_created: 'Ticket created',
  ticket_updated: 'Ticket updated',
  ticket_deleted: 'Ticket deleted',
  comment_added: 'Comment added',
  comment_updated: 'Comment updated',
  comment_deleted: 'Comment deleted',
}

/**
 * Display labels for `ticket_activity_log.action`.
 * Customer comments show as "Customer Reply" instead of "Comment added".
 */
export function formatTicketActivityAction(action: string, actorRole?: string | null): string {
  if (action === 'comment_added' && actorRole === 'customer') return 'Customer Reply'
  return ACTION_LABELS[action] ?? action
}

/**
 * Navbar activity peek: only three phrasing — created, customer reply, ticket edit.
 * Use together with `isTicketActivityNavbarPeekRow`.
 */
export function formatTicketActivityNavbarLabel(action: string, actorRole?: string | null): string {
  if (action === 'ticket_created') return 'Ticket created'
  if (action === 'ticket_updated') return 'Ticket Edit'
  if (action === 'comment_added' && actorRole === 'customer') return 'Customer Reply'
  return formatTicketActivityAction(action, actorRole)
}

/** Rows eligible for the ticket search navbar activity dropdown (staff sees customer-facing stream). */
export function isTicketActivityNavbarPeekRow(row: { action: string; actor_role: string }): boolean {
  if (row.action === 'ticket_created' || row.action === 'ticket_updated') return true
  if (row.action === 'comment_added' && row.actor_role === 'customer') return true
  return false
}
