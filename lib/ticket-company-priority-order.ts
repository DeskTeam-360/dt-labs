import { and, eq, ne } from 'drizzle-orm'
import type { PostgresJsDatabase, PostgresJsTransaction } from 'drizzle-orm/postgres-js'

import type * as schema from '@/lib/db/schema'
import { tickets } from '@/lib/db/schema'
import { DEFAULT_TICKET_TYPE } from '@/lib/ticket-classification'

type AppFullSchema = typeof schema
/** Executor is `db` or a `db.transaction` `tx`, not merely `typeof db`, so callers can pass a transaction through. */
export type TicketPriorityDbExecutor =
  | PostgresJsDatabase<AppFullSchema>
  | PostgresJsTransaction<AppFullSchema, Record<string, never>>

/** SQL NULL / empty / ≤0 sorts to the end of the company support queue (not numbered). */
function sortPriorityKey(p: number | null | undefined): number {
  if (p === null || p === undefined) return Number.MAX_SAFE_INTEGER
  const n = Number(p)
  return !Number.isFinite(n) || n <= 0 ? Number.MAX_SAFE_INTEGER : n
}

/** Normalize rank from request: value ≥ 1 = slot (1 = first); ≤ 0 / empty = append at end. */
export function parseCompanyTicketDesiredRank(raw: unknown): number | 'append' {
  if (raw === undefined || raw === null || raw === '') return 'append'
  const n = Number(raw)
  if (!Number.isFinite(n)) return 'append'
  const floored = Math.floor(n)
  if (floored <= 0) return 'append'
  return floored
}

async function loadCompanySupportTicketRows(dbTx: TicketPriorityDbExecutor, companyId: string, omitTicketId?: number) {
  const conditions = [
    eq(tickets.companyId, companyId),
    eq(tickets.ticketType, DEFAULT_TICKET_TYPE),
    ne(tickets.status, 'closed'),
  ] as const
  const q = dbTx
    .select({ id: tickets.id, priority: tickets.priority })
    .from(tickets)
    .where(
      omitTicketId !== undefined ? and(...conditions, ne(tickets.id, omitTicketId)) : and(...conditions)
    )
  return q
}

/**
 * Write final order 1..n without violating UNIQUE (company_id, priority):
 * phase 1 priority = -id, phase 2 priority = 1..n.
 */
async function writeOrderedSupportPriorities(dbTx: TicketPriorityDbExecutor, orderedIds: number[]): Promise<void> {
  if (orderedIds.length === 0) return
  const now = new Date()
  for (const id of orderedIds) {
    await dbTx
      .update(tickets)
      .set({ priority: -Math.abs(id), updatedAt: now })
      .where(eq(tickets.id, id))
  }
  for (let i = 0; i < orderedIds.length; i++) {
    await dbTx
      .update(tickets)
      .set({ priority: i + 1, updatedAt: now })
      .where(eq(tickets.id, orderedIds[i]!))
  }
}

/** Compact support-ticket priorities per company to 1..n (delete/trash/remove from pool). */
export async function compactCompanySupportPriorities(
  dbTx: TicketPriorityDbExecutor,
  companyId: string,
  omitTicketId?: number
): Promise<void> {
  const rows = await loadCompanySupportTicketRows(dbTx, companyId, omitTicketId)
  const sorted = [...rows].sort((a, b) => {
    const da = sortPriorityKey(a.priority)
    const db = sortPriorityKey(b.priority)
    if (da !== db) return da - db
    return a.id - b.id
  })
  await writeOrderedSupportPriorities(dbTx, sorted.map((r) => r.id))
}

/**
 * Place one support ticket at `desiredRank` (1-based) within a company;
 * other tickets shift accordingly (insert / bump up or down).
 */
export async function assignCompanySupportTicketRank(
  dbTx: TicketPriorityDbExecutor,
  companyId: string,
  ticketId: number,
  desiredRank: number | 'append'
): Promise<void> {
  const rows = await loadCompanySupportTicketRows(dbTx, companyId)
  const sorted = [...rows].sort((a, b) => {
    const da = sortPriorityKey(a.priority)
    const db = sortPriorityKey(b.priority)
    if (da !== db) return da - db
    return a.id - b.id
  })

  const ids = sorted.map((r) => r.id)
  const ix = ids.indexOf(ticketId)
  if (ix === -1) return

  const without = ids.filter((id) => id !== ticketId)
  const maxRank = without.length + 1
  const rank =
    desiredRank === 'append' ? maxRank : Math.min(Math.max(1, desiredRank), maxRank)
  const insertAt = rank - 1
  const nextOrder = [...without.slice(0, insertAt), ticketId, ...without.slice(insertAt)]

  await writeOrderedSupportPriorities(dbTx, nextOrder)
}
