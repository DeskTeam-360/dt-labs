/** Canonical first status for new tickets (matches db seed / DEFAULT_ALL_STATUSES). */
export const DEFAULT_NEW_TICKET_STATUS_SLUG = 'open' as const

/**
 * Prefer `open` when it exists and is active; otherwise first active status, then any first row.
 */
export function resolveDefaultNewTicketStatusSlug(
  allStatuses: Array<{ slug: string; is_active?: boolean }>
): string {
  const active = (s: { is_active?: boolean }) => s.is_active !== false
  const prefer = DEFAULT_NEW_TICKET_STATUS_SLUG
  const openRow = allStatuses.find((s) => s.slug === prefer && active(s))
  if (openRow) return prefer
  const firstActive = allStatuses.find(active)
  return firstActive?.slug ?? allStatuses[0]?.slug ?? prefer
}
