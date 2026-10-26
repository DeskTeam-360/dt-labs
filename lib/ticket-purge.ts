import { and, eq, inArray } from 'drizzle-orm'

import {
  commentAttachments,
  db,
  emailMessages,
  recurringTicketRuns,
  screenshots,
  ticketActivityLog,
  ticketAiSummaries,
  ticketAssignees,
  ticketAttachments,
  ticketAttributs,
  ticketCcRecipients,
  ticketChecklist,
  ticketComments,
  ticketNotifications,
  tickets,
  ticketTimeTracker,
  userCompanyChanges,
} from '@/lib/db'
import { deleteObject } from '@/lib/storage-provider'

/**
 * Permanently deletes tickets that are already in Trash, with everything that belongs to them
 * (comments, attachments, time tracked, assignees, notifications, activity ...). Tickets that are not in Trash are
 * skipped. Rows that only point at a ticket for reference (email log, screenshots, recurring runs, company history)
 * are kept and just lose the link. Files are removed from storage unless another attachment still uses the same file
 * (a merged ticket keeps linked copies).
 */
export async function purgeTickets(ids: number[]): Promise<{ deleted: number; skipped: number }> {
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0)
  if (unique.length === 0) return { deleted: 0, skipped: 0 }

  const inTrash = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(inArray(tickets.id, unique), eq(tickets.ticketType, 'trash')))
  const target = inTrash.map((r) => r.id)
  if (target.length === 0) return { deleted: 0, skipped: unique.length }

  const commentRows = await db.select({ id: ticketComments.id }).from(ticketComments).where(inArray(ticketComments.ticketId, target))
  const commentIds = commentRows.map((c) => c.id)

  const [ticketFiles, commentFiles] = await Promise.all([
    db
      .select({ path: ticketAttachments.filePath, url: ticketAttachments.fileUrl })
      .from(ticketAttachments)
      .where(inArray(ticketAttachments.ticketId, target)),
    commentIds.length
      ? db
          .select({ path: commentAttachments.filePath, url: commentAttachments.fileUrl })
          .from(commentAttachments)
          .where(inArray(commentAttachments.commentId, commentIds))
      : Promise.resolve([] as { path: string | null; url: string }[]),
  ])

  await db.transaction(async (tx) => {
    if (commentIds.length) await tx.delete(commentAttachments).where(inArray(commentAttachments.commentId, commentIds))
    await tx.delete(ticketAiSummaries).where(inArray(ticketAiSummaries.ticketId, target))
    await tx.delete(ticketComments).where(inArray(ticketComments.ticketId, target))
    await tx.delete(ticketAttachments).where(inArray(ticketAttachments.ticketId, target))
    await tx.delete(ticketAssignees).where(inArray(ticketAssignees.ticketId, target))
    await tx.delete(ticketChecklist).where(inArray(ticketChecklist.ticketId, target))
    await tx.delete(ticketAttributs).where(inArray(ticketAttributs.ticketId, target))
    await tx.delete(ticketTimeTracker).where(inArray(ticketTimeTracker.ticketId, target))
    await tx.delete(ticketCcRecipients).where(inArray(ticketCcRecipients.ticketId, target))
    await tx.delete(ticketNotifications).where(inArray(ticketNotifications.ticketId, target))
    await tx.delete(ticketActivityLog).where(inArray(ticketActivityLog.ticketId, target))
    // Kept for reference, only unlinked.
    await tx.update(emailMessages).set({ ticketId: null }).where(inArray(emailMessages.ticketId, target))
    await tx.update(screenshots).set({ ticketId: null }).where(inArray(screenshots.ticketId, target))
    await tx.update(recurringTicketRuns).set({ ticketId: null }).where(inArray(recurringTicketRuns.ticketId, target))
    await tx.update(userCompanyChanges).set({ ticketId: null }).where(inArray(userCompanyChanges.ticketId, target))
    // Tickets that were merged into a deleted one stand on their own again.
    await tx.update(tickets).set({ mergedIntoTicketId: null }).where(inArray(tickets.mergedIntoTicketId, target))
    // Tags and skills go with the ticket (ON DELETE CASCADE).
    await tx.delete(tickets).where(inArray(tickets.id, target))
  })

  // Storage clean-up after the data is gone; never fails the request.
  try {
    const files = [...ticketFiles, ...commentFiles].filter((f) => f.path && f.path.length > 0)
    const urls = [...new Set(files.map((f) => f.url))]
    if (urls.length > 0) {
      const [stillA, stillB] = await Promise.all([
        db.select({ url: ticketAttachments.fileUrl }).from(ticketAttachments).where(inArray(ticketAttachments.fileUrl, urls)),
        db.select({ url: commentAttachments.fileUrl }).from(commentAttachments).where(inArray(commentAttachments.fileUrl, urls)),
      ])
      const inUse = new Set([...stillA, ...stillB].map((r) => r.url))
      const paths = [...new Set(files.filter((f) => !inUse.has(f.url)).map((f) => f.path as string))]
      await Promise.all(paths.map((p) => deleteObject(p).catch(() => undefined)))
    }
  } catch (e) {
    console.error('[purgeTickets] storage clean-up failed:', (e as Error)?.message)
  }

  return { deleted: target.length, skipped: unique.length - target.length }
}
