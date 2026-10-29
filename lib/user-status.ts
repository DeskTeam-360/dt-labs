/**
 * Inactive people (switched off or suspended) do not appear in pickers: tags, assignees, contacts, filters.
 * They are only listed on the Inactive tab of Users management.
 * "pending" (invited, not yet signed in) is not inactive.
 */
export const INACTIVE_USER_STATUSES = ['inactive', 'suspended']

export function isUserInactive(status: string | null | undefined): boolean {
  return INACTIVE_USER_STATUSES.includes((status ?? '').toLowerCase())
}
