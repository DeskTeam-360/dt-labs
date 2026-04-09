/** Slugs treated as finished for metrics, overdue highlighting, and legacy DB rows. */
const CLOSED_LIKE = new Set(['resolved', 'closed', 'completed', 'cancel', 'archived'])

export function isClosedLikeTicketStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return CLOSED_LIKE.has(status.toLowerCase())
}
