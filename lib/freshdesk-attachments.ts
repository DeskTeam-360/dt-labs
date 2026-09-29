import { and, eq } from 'drizzle-orm'

import { commentAttachments, db, ticketAttachments, ticketComments } from '@/lib/db'
import { uploadBuffer } from '@/lib/storage-idrive'

export type FdAttachment = {
  id: number
  name: string
  attachment_url: string
  content_type?: string
  size?: number
}

export type FdAttachmentImportResult = {
  imported: number
  skipped: number
  failed: number
  errors: { file: string; reason: string }[]
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200)
}

async function downloadAttachment(
  url: string,
  authHeader: string
): Promise<{ buffer: Buffer; contentType: string } | { error: string }> {
  // FD attachment URLs are usually pre-signed S3 links that reject an Authorization header, so try without it first.
  const attempts: Record<string, string>[] = [{}, { Authorization: authHeader }]
  for (const headers of attempts) {
    try {
      const res = await fetch(url, { headers })
      if (res.ok) {
        return {
          buffer: Buffer.from(await res.arrayBuffer()),
          contentType: res.headers.get('content-type') || 'application/octet-stream',
        }
      }
      if (res.status === 401 || res.status === 403) continue
      return { error: `HTTP ${res.status}` }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }
  return { error: 'HTTP 403 (with and without auth)' }
}

async function alreadyStored(ticketId: number, commentId: string | null, fileName: string): Promise<boolean> {
  const rows = commentId
    ? await db
        .select({ id: commentAttachments.id })
        .from(commentAttachments)
        .where(and(eq(commentAttachments.commentId, commentId), eq(commentAttachments.fileName, fileName)))
        .limit(1)
    : await db
        .select({ id: ticketAttachments.id })
        .from(ticketAttachments)
        .where(and(eq(ticketAttachments.ticketId, ticketId), eq(ticketAttachments.fileName, fileName)))
        .limit(1)
  return rows.length > 0
}

/**
 * Downloads FD ticket + conversation attachments to our storage and links them to the ticket / imported comment.
 * Attachment URLs expire quickly, so callers must pass freshly fetched FD payloads.
 * Conversation files whose comment isn't imported yet fall back to ticket-level attachments.
 */
export async function importFdTicketAttachments(params: {
  ticketId: number
  ticketFiles: FdAttachment[]
  conversations: { id: number; attachments?: FdAttachment[] }[]
  authHeader: string
}): Promise<FdAttachmentImportResult> {
  const { ticketId, authHeader } = params
  const result: FdAttachmentImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] }

  const store = async (att: FdAttachment, commentId: string | null, pathPrefix: string) => {
    if (!att?.attachment_url || !att.name) return
    if (await alreadyStored(ticketId, commentId, att.name)) {
      result.skipped++
      return
    }
    const downloaded = await downloadAttachment(att.attachment_url, authHeader)
    if ('error' in downloaded) {
      result.failed++
      result.errors.push({ file: att.name, reason: `download failed: ${downloaded.error}` })
      return
    }
    const filePath = `${pathPrefix}/${att.id}_${sanitizeFileName(att.name)}`
    const { url: fileUrl, error } = await uploadBuffer(filePath, downloaded.buffer, downloaded.contentType)
    if (!fileUrl) {
      result.failed++
      result.errors.push({ file: att.name, reason: `upload failed: ${error}` })
      return
    }
    if (commentId) {
      await db.insert(commentAttachments).values({ commentId, fileUrl, fileName: att.name, filePath })
    } else {
      await db.insert(ticketAttachments).values({ ticketId, fileUrl, fileName: att.name, filePath })
    }
    result.imported++
  }

  for (const att of params.ticketFiles) {
    await store(att, null, `freshdesk/attachments/tickets/${ticketId}`)
  }

  for (const conv of params.conversations) {
    if (!conv.attachments?.length) continue
    const [comment] = await db
      .select({ id: ticketComments.id })
      .from(ticketComments)
      .where(and(eq(ticketComments.ticketId, ticketId), eq(ticketComments.fdConversationId, conv.id)))
      .limit(1)
    const commentId = comment?.id ?? null
    const prefix = commentId
      ? `freshdesk/attachments/tickets/${ticketId}/comments/${commentId}`
      : `freshdesk/attachments/tickets/${ticketId}/conversations/${conv.id}`
    for (const att of conv.attachments) {
      await store(att, commentId, prefix)
    }
  }

  return result
}
