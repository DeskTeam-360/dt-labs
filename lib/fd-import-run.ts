import { archiveSource, freshdeskSource, loadArchiveSettings, type TicketSource } from '@/lib/fd-ticket-source'
import {
  createFdClient,
  type FdTicketImportResult,
  importFdTicketById,
  loadFdAgentNames,
  resetTicketIdSequence,
} from '@/lib/freshdesk-ticket-import'

export const FD_IMPORT_MAX_IDS = 50

export type FdImportSourceKind = 'freshdesk' | 'archive'

/** Ticket numbers from a list or a text ("123, #456 789"): whole positive numbers, no duplicates. */
export function parseFdTicketIds(input: unknown): number[] {
  const raw: unknown[] = Array.isArray(input) ? input : String(input ?? '').split(/[\s,;]+/)
  return [...new Set(raw.map((v) => Number(String(v).replace(/^#/, '').trim())))].filter((n) => Number.isInteger(n) && n > 0)
}

/** The place tickets are read from: Freshdesk itself, or the FD Archive. An error text when that one is not set up in Settings. */
export async function buildFdSource(kind: FdImportSourceKind): Promise<{ source: TicketSource } | { error: string }> {
  if (kind === 'archive') {
    const archive = await loadArchiveSettings()
    if (!archive) return { error: 'The FD Archive address and API key are not set. Fill them in under Settings, Freshdesk Import.' }
    return { source: await archiveSource(archive.baseUrl, archive.apiKey) }
  }
  const fd = await createFdClient()
  if (!fd) return { error: 'Freshdesk domain and API key are not configured' }
  return { source: freshdeskSource(fd, await loadFdAgentNames(fd)) }
}

/** Imports the tickets one by one (a failure on one does not stop the others) and fixes the ticket number sequence afterwards. */
export async function runFdImport(
  ids: number[],
  kind: FdImportSourceKind,
  adminUserId: string
): Promise<{ source: FdImportSourceKind; results: FdTicketImportResult[] } | { error: string }> {
  const built = await buildFdSource(kind)
  if ('error' in built) return built

  const results: FdTicketImportResult[] = []
  for (const ticketId of ids) {
    try {
      results.push(await importFdTicketById({ source: built.source, ticketId, adminUserId }))
    } catch (e) {
      console.error('[FD import-tickets] ticket', ticketId, e)
      results.push({ ticketId, status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  if (results.some((r) => r.status === 'imported')) {
    try {
      await resetTicketIdSequence()
    } catch (e) {
      console.error('[FD import-tickets] sequence reset failed', e)
    }
  }
  return { source: built.source.kind, results }
}
