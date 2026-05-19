import { eq } from 'drizzle-orm'

import { db, ticketTypes } from '@/lib/db'

/**
 * Validates that customers may assign `typeId` when creating or updating tickets.
 * `null` / undefined clears type and is always allowed.
 */
export async function assertCustomerMayUseTicketType(
  typeId: number | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeId === null || typeId === undefined) return { ok: true }
  const [row] = await db
    .select({ isAgentOnly: ticketTypes.isAgentOnly })
    .from(ticketTypes)
    .where(eq(ticketTypes.id, typeId))
    .limit(1)
  if (!row) return { ok: false, error: 'Invalid ticket type' }
  if (row.isAgentOnly) {
    return { ok: false, error: 'This ticket type is only available to agents' }
  }
  return { ok: true }
}
