import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { canAccessEmailIntegration } from '@/lib/auth-utils'
import { db, emailMessages, emailSkipList, tickets } from '@/lib/db'

export type HeldEmailReason = 'blocked' | 'unknown_ticket' | 'not_linked'

function subjectTicketId(subject: string | null): number | null {
  if (!subject) return null
  const m = subject.match(/\[Ticket\s*#(\d+)\]/i) || subject.match(/\bTicket\s*#\s*(\d+)\b/i)
  return m ? parseInt(m[1], 10) : null
}

/** GET /api/email/held — incoming emails that never became a ticket or a reply, newest first. */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessEmailIntegration((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10)))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))
  const search = url.searchParams.get('search')?.trim()

  const where = and(
    eq(emailMessages.direction, 'incoming'),
    isNull(emailMessages.ticketId),
    search
      ? or(ilike(emailMessages.fromEmail, `%${search}%`), ilike(emailMessages.subject, `%${search}%`))
      : undefined
  )

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: emailMessages.id,
        fromEmail: emailMessages.fromEmail,
        toEmail: emailMessages.toEmail,
        subject: emailMessages.subject,
        snippet: emailMessages.snippet,
        syncedAt: emailMessages.syncedAt,
      })
      .from(emailMessages)
      .where(where)
      .orderBy(desc(emailMessages.syncedAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(emailMessages).where(where),
  ])

  const senders = [...new Set(rows.map((r) => (r.fromEmail ?? '').toLowerCase()).filter(Boolean))]
  const blocked = new Set(
    senders.length
      ? (
          await db
            .select({ email: emailSkipList.email })
            .from(emailSkipList)
            .where(inArray(sql`lower(${emailSkipList.email})`, senders))
        ).map((r) => r.email.toLowerCase())
      : []
  )

  const referencedIds = [...new Set(rows.map((r) => subjectTicketId(r.subject)).filter((n): n is number => n !== null))]
  const existingIds = new Set(
    referencedIds.length
      ? (await db.select({ id: tickets.id }).from(tickets).where(inArray(tickets.id, referencedIds))).map((r) => r.id)
      : []
  )

  return NextResponse.json({
    total,
    data: rows.map((r) => {
      const sender = (r.fromEmail ?? '').toLowerCase()
      const refId = subjectTicketId(r.subject)
      const reason: HeldEmailReason = blocked.has(sender)
        ? 'blocked'
        : refId !== null && !existingIds.has(refId)
          ? 'unknown_ticket'
          : 'not_linked'
      return {
        id: r.id,
        from_email: r.fromEmail,
        to_email: r.toEmail,
        subject: r.subject,
        snippet: r.snippet,
        synced_at: r.syncedAt ? new Date(r.syncedAt).toISOString() : null,
        reason,
        referenced_ticket_id: reason === 'unknown_ticket' ? refId : null,
      }
    }),
  })
}
