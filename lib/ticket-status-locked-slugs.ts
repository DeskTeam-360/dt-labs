/**
 * Canonical workflow statuses (same slugs as scripts/seed.ts). Must never be deletable
 * from API/UI even if `is_deletable` in DB is wrong.
 */
export const LOCKED_TICKET_STATUS_SLUGS = [
  'open',
  'pending',
  // 'resolved',
  'closed',
] as const

export function isLockedTicketStatusSlug(slug: string): boolean {
  return (LOCKED_TICKET_STATUS_SLUGS as readonly string[]).includes(slug)
}
