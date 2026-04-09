import { sql, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ticketStatuses } from '@/lib/db/schema'
import { LOCKED_TICKET_STATUS_SLUGS } from '@/lib/ticket-status-locked-slugs'

let ensurePromise: Promise<void> | null = null

/**
 * Ensures `ticket_statuses.is_deletable` exists, then locks default workflow rows
 * (same slugs as prisma/seed.ts). Idempotent; safe if 020 migration was already applied.
 */
export function ensureTicketStatusIsDeletableColumn(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await db.execute(
        sql`ALTER TABLE ticket_statuses ADD COLUMN IF NOT EXISTS is_deletable boolean NOT NULL DEFAULT true`
      )
      await db.execute(
        sql`ALTER TABLE ticket_statuses ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`
      )
      await db
        .update(ticketStatuses)
        .set({ isDeletable: false })
        .where(inArray(ticketStatuses.slug, [...LOCKED_TICKET_STATUS_SLUGS]))
    })()
  }
  return ensurePromise
}
