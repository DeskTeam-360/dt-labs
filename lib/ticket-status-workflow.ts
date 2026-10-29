/** Slugs treated as finished for metrics, overdue highlighting, and legacy DB rows. */
const CLOSED_LIKE = new Set(['resolved', 'closed', 'completed', 'cancel', 'archived', 'pending'])

/** The finished statuses as a list (for queries). */
export const CLOSED_LIKE_STATUS_LIST: string[] = [...CLOSED_LIKE]

export function isClosedLikeTicketStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return CLOSED_LIKE.has(status.toLowerCase())
}
