import { auth } from '@/auth'
import { db, ticketComments, commentAttachments, ticketCcRecipients, tickets, users, companyUsers } from '@/lib/db'
import { runTicketCommentAutomation } from '@/lib/automation-engine'
import { eq, ilike } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

function randomPassword(length = 24): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function truncateVarchar(s: string | null | undefined, maxLen: number): string {
  if (s == null || s === '') return ''
  const str = String(s).trim()
  return str.length <= maxLen ? str : str.slice(0, maxLen)
}

function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })

  const body = await request.json()
  const {
    comment,
    visibility = 'reply',
    author_type = 'agent',
    attachments = [],
    tagged_user_ids = [],
    cc_emails = [],
    bcc_emails = [],
  } = body as {
    comment?: string
    visibility?: string
    author_type?: string
    attachments?: Array<{ file_url: string; file_name: string; file_path: string }>
    tagged_user_ids?: string[]
    cc_emails?: string[]
    bcc_emails?: string[]
  }

  const role = (session.user as { role?: string }).role?.toLowerCase()
  const isCustomer = role === 'customer'
  const effectiveVisibility = isCustomer ? 'reply' : visibility
  const effectiveAuthorType = isCustomer ? 'customer' : author_type
  const effectiveTaggedIds = isCustomer ? [] : (Array.isArray(tagged_user_ids) ? tagged_user_ids : [])

  const [row] = await db
    .insert(ticketComments)
    .values({
      ticketId,
      userId: session.user.id,
      comment: comment || '',
      visibility: effectiveVisibility,
      authorType: effectiveAuthorType,
      taggedUserIds: effectiveTaggedIds.length > 0 ? effectiveTaggedIds : null,
      ccEmails: Array.isArray(cc_emails) && cc_emails.length > 0 ? cc_emails.filter((e: string) => e?.trim()) : null,
      bccEmails: Array.isArray(bcc_emails) && bcc_emails.length > 0 ? bcc_emails.filter((e: string) => e?.trim()) : null,
    })
    .returning()

  if (!row) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  const allCcEmails = [
    ...(Array.isArray(cc_emails) ? cc_emails.filter((e: string) => e?.trim()?.includes('@')) : []),
  ].map((e: string) => e.trim().toLowerCase()).filter(Boolean)

  let ticketCompanyId: string | null = null
  if (allCcEmails.length > 0) {
    const [ticketRow] = await db.select({ companyId: tickets.companyId }).from(tickets).where(eq(tickets.id, ticketId)).limit(1)
    ticketCompanyId = ticketRow?.companyId ?? null
  }

  for (const trimmed of allCcEmails) {
    if (!trimmed) continue
    try {
      await db
        .insert(ticketCcRecipients)
        .values({ ticketId, email: truncateVarchar(trimmed, 255) })
        .onConflictDoNothing({ target: [ticketCcRecipients.ticketId, ticketCcRecipients.email] })
    } catch {}

    if (ticketCompanyId) {
      const [ccUser] = await db.select({ id: users.id }).from(users).where(ilike(users.email, escapeIlike(trimmed))).limit(1)
      if (ccUser) {
        await db.update(users).set({ companyId: ticketCompanyId, updatedAt: new Date() }).where(eq(users.id, ccUser.id))
        try {
          await db.insert(companyUsers).values({ companyId: ticketCompanyId, userId: ccUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
        } catch {}
      } else {
        try {
          const [newCcUser] = await db
            .insert(users)
            .values({
              email: truncateVarchar(trimmed, 255),
              fullName: truncateVarchar(trimmed.split('@')[0] || 'User', 255),
              companyId: ticketCompanyId,
              role: 'customer',
              passwordHash: await bcrypt.hash(randomPassword(), 10),
            })
            .returning({ id: users.id })
          if (newCcUser) {
            await db.insert(companyUsers).values({ companyId: ticketCompanyId, userId: newCcUser.id }).onConflictDoNothing({ target: [companyUsers.companyId, companyUsers.userId] })
          }
        } catch (e) {
          console.error('[Comments] CC user create failed:', trimmed, (e as Error)?.message)
        }
      }
    }
  }

  if (attachments.length > 0) {
    await db.insert(commentAttachments).values(
      attachments.map((a: { file_url: string; file_name: string; file_path: string }) => ({
        commentId: row.id,
        fileUrl: a.file_url,
        fileName: a.file_name,
        filePath: a.file_path,
        uploadedBy: session.user.id,
      }))
    )
  }

  try {
    await runTicketCommentAutomation(ticketId, {
      visibility: effectiveVisibility,
      authorType: effectiveAuthorType,
    })
  } catch (err) {
    console.error('Automation rules error (ticket_comment_added):', err)
  }

  return NextResponse.json({
    id: row.id,
    ticket_id: row.ticketId,
    user_id: row.userId,
    comment: row.comment,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    visibility: row.visibility ?? 'reply',
    author_type: row.authorType ?? 'agent',
    tagged_user_ids: row.taggedUserIds ?? [],
    cc_emails: row.ccEmails ?? [],
    bcc_emails: row.bccEmails ?? [],
    user: { id: session.user.id, full_name: session.user.name, email: session.user.email, avatar_url: session.user.image },
    comment_attachments: attachments.map((a: { file_url: string; file_name: string }) => ({ id: '', file_url: a.file_url, file_name: a.file_name })),
  })
}
