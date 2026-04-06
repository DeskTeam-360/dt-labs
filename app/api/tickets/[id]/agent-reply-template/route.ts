import { auth } from '@/auth'
import { db, messageTemplates, tickets, users } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { mergeMessageTemplateHtml, userRowToMergeMap } from '@/lib/message-template-merge'

export const dynamic = 'force-dynamic'

const AGENT_REPLY_TEMPLATE_KEY = 'template_agent_reply' as const

function requestOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000'
  const proto = request.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`.replace(/\/$/, '')
}

function isAgentRole(role: string | undefined): boolean {
  const r = (role || '').toLowerCase()
  return r === 'admin' || r === 'staff' || r === 'manager'
}

/** GET — merged HTML for Agent Reply template (`template_agent_reply`) for this ticket. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAgentRole((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const ticketIdNum = parseInt(id, 10)
  if (Number.isNaN(ticketIdNum)) {
    return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 })
  }

  const [tpl] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.key, AGENT_REPLY_TEMPLATE_KEY), eq(messageTemplates.status, 'active')))
    .limit(1)
  const raw = tpl?.content?.trim() ?? ''
  if (!raw) {
    return NextResponse.json({ html: '' })
  }

  const [ticketRow] = await db
    .select({ ticket: tickets, creator: users })
    .from(tickets)
    .leftJoin(users, eq(tickets.createdBy, users.id))
    .where(eq(tickets.id, ticketIdNum))
    .limit(1)

  if (!ticketRow?.ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [senderRow] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

  const recipientMap = userRowToMergeMap(ticketRow.creator ?? null)
  const senderMap = userRowToMergeMap(senderRow ?? null)

  const origin = requestOrigin(request)
  const html = mergeMessageTemplateHtml(raw, {
    origin,
    ticketId: String(ticketIdNum),
    recipient: recipientMap,
    sender: senderMap,
    useDomMerge: false,
  })

  return NextResponse.json({ html })
}
