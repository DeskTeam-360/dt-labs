/**
 * Activity action values stored in `ticket_activity_log.action`.
 * Kept separate from `ticket-activity-log.ts` so client components can import without pulling `postgres`/db.
 */
export const TICKET_ACTIVITY_ACTIONS = [
  'ticket_created',
  'ticket_updated',
  'ticket_deleted',
  'comment_added',
  'comment_updated',
  'comment_deleted',
  'comment_attachment_deleted',
] as const

export type TicketActivityAction = (typeof TICKET_ACTIVITY_ACTIONS)[number]
