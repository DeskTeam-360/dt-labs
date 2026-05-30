import { and, asc, eq, isNull, ne, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { assertCustomerMayAccessTicket } from '@/lib/customer-ticket-access'
import {
  db,
  ticketComments,
  tickets,
  users,
} from '@/lib/db'
import {
  buildLocalizedSummarizePrompt,
  parseSummarizeAnchorBody,
  pickCommentWindow,
  requestOpenAiLocalizedSummary,
  stripHtmlForPrompt,
} from '@/lib/ticket-comment-summarize'

function authorLabel(name: string | null, email: string | null): string {
  return name || email || 'Unknown'
}

/** POST /api/tickets/[id]/comments/summarize — localized AI summary (focal + neighbors) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const ticketId = parseInt(id, 10)
  if (isNaN(ticketId)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const role = (session.user as { role?: string }).role?.toLowerCase() ?? 'user'
  const userId = session.user.id

  if (role === 'customer') {
    const access = await assertCustomerMayAccessTicket(userId, ticketId)
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? 'Ticket not found' : 'Forbidden' },
        { status: access.status }
      )
    }
  }

  const body = await request.json().catch(() => ({}))
  const anchor = parseSummarizeAnchorBody(body)

  const [ticket] = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      description: tickets.description,
      createdBy: tickets.createdBy,
      creatorName: users.fullName,
      creatorEmail: users.email,
    })
    .from(tickets)
    .leftJoin(users, eq(tickets.createdBy, users.id))
    .where(eq(tickets.id, ticketId))
    .limit(1)

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  const commentScope =
    role === 'customer'
      ? and(
          eq(ticketComments.ticketId, ticketId),
          or(isNull(ticketComments.visibility), ne(ticketComments.visibility, 'note'))
        )
      : eq(ticketComments.ticketId, ticketId)

  const commentRows = await db
    .select({
      comment: ticketComments,
      userName: users.fullName,
      userEmail: users.email,
    })
    .from(ticketComments)
    .leftJoin(users, eq(ticketComments.userId, users.id))
    .where(commentScope)
    .orderBy(asc(ticketComments.createdAt))

  type Row = (typeof commentRows)[number]

  const mapComment = (r: Row, isFocal: boolean) => ({
    id: r.comment.id,
    isFocal,
    author: authorLabel(r.userName, r.userEmail),
    authorType: r.comment.authorType ?? 'agent',
    visibility: r.comment.visibility ?? 'reply',
    createdAt: r.comment.createdAt ? new Date(r.comment.createdAt).toISOString() : '',
    body: stripHtmlForPrompt(r.comment.comment ?? ''),
  })

  let promptCtx: Parameters<typeof buildLocalizedSummarizePrompt>[0]

  if (anchor.type === 'comment') {
    const indexed = commentRows.map((r) => ({ row: r, id: r.comment.id }))
    const picked = pickCommentWindow(indexed, anchor.commentId, 3, 3)
    if (!picked) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const focalRow = picked.window[picked.focalIndex].row
    const focalAuthor = authorLabel(focalRow.userName, focalRow.userEmail)
    const focalAuthorType = focalRow.comment.authorType ?? 'agent'

    promptCtx = {
      ticketTitle: ticket.title,
      anchor: 'comment',
      focalAuthor,
      focalAuthorType,
      comments: picked.window.map((w, i) => mapComment(w.row, i === picked.focalIndex)),
    }
  } else {
    const focalAuthor = authorLabel(ticket.creatorName, ticket.creatorEmail)
    const creatorId = ticket.createdBy
    /** Only the creator's earliest comments (max 3); others are omitted from the excerpt. */
    const creatorComments =
      creatorId != null
        ? commentRows.filter((r) => r.comment.userId === creatorId).slice(0, 3)
        : []

    promptCtx = {
      ticketTitle: ticket.title,
      anchor: 'description',
      focalAuthor,
      focalAuthorType: 'agent',
      ticketDescription: stripHtmlForPrompt(ticket.description ?? ''),
      comments: creatorComments.map((r) => mapComment(r, false)),
    }
  }

  try {
    const result = await requestOpenAiLocalizedSummary(buildLocalizedSummarizePrompt(promptCtx))
    return NextResponse.json({
      summary: result.summary,
      checklist: result.checklist,
      /** @deprecated use summary */
      items: result.summary,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Summary failed'
    console.error('[comments/summarize]', err)
    const status = msg.includes('OPENAI_API_KEY') ? 503 : 502
    return NextResponse.json({ error: msg }, { status })
  }
}
