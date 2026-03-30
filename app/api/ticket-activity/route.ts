import { auth } from '@/auth'
import { db, ticketActivityLog, tickets, users, companyUsers } from '@/lib/db'
import { isAdmin } from '@/lib/auth-utils'
import { TICKET_ACTIVITY_ACTIONS, type TicketActivityAction } from '@/lib/ticket-activity-actions'
import { and, desc, eq, inArray, or, sql, count, ilike, type SQL } from 'drizzle-orm'
import { NextResponse } from 'next/server'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function escapeIlikePattern(s: string): string {
  return `%${s.trim().replace(/[%_\\]/g, '\\$&')}%`
}

/**
 * GET /api/ticket-activity — recent ticket_activity_log rows scoped like GET /api/tickets (company / visibility).
 * Query: limit, offset, action (TicketActivityAction), search (ticket id, title, actor, metadata text)
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id!
  const role = (session.user as { role?: string }).role?.toLowerCase()

  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10)),
    MAX_LIMIT
  )
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const actionParam = url.searchParams.get('action')?.trim() ?? ''
  const actionFilter: TicketActivityAction | null =
    actionParam && (TICKET_ACTIVITY_ACTIONS as readonly string[]).includes(actionParam)
      ? (actionParam as TicketActivityAction)
      : null

  const searchRaw = url.searchParams.get('search')?.trim() ?? ''

  const visibilityAccess = or(
    eq(tickets.visibility, 'public'),
    and(eq(tickets.visibility, 'private'), eq(tickets.createdBy, userId)),
    sql`(${tickets.visibility} = 'specific_users' AND ${tickets.id} IN (SELECT ticket_id FROM ticket_assignees WHERE user_id = ${userId}))`,
    sql`(${tickets.visibility} = 'team' AND ${tickets.teamId} IN (SELECT team_id FROM team_members WHERE user_id = ${userId}))`
  )!

  let ticketFilter: ReturnType<typeof inArray> | ReturnType<typeof or> | null = null

  if (role === 'customer') {
    const [userRow] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1)
    let companyId = userRow?.companyId ?? null
    if (!companyId) {
      const [cu] = await db
        .select({ companyId: companyUsers.companyId })
        .from(companyUsers)
        .where(eq(companyUsers.userId, userId))
        .limit(1)
      companyId = cu?.companyId ?? null
    }
    if (!companyId) {
      return NextResponse.json({ data: [], total: 0 })
    }
    ticketFilter = inArray(tickets.companyId, [companyId])
  } else if (!isAdmin(role)) {
    ticketFilter = visibilityAccess
  }

  const fields = {
    id: ticketActivityLog.id,
    ticket_id: tickets.id,
    ticket_title: tickets.title,
    action: ticketActivityLog.action,
    actor_role: ticketActivityLog.actorRole,
    metadata: ticketActivityLog.metadata,
    created_at: ticketActivityLog.createdAt,
    actor_name: users.fullName,
    actor_email: users.email,
    actor_avatar_url: users.avatarUrl,
  }

  const listBase = db
    .select(fields)
    .from(ticketActivityLog)
    .innerJoin(tickets, eq(ticketActivityLog.ticketId, tickets.id))
    .leftJoin(users, eq(ticketActivityLog.actorUserId, users.id))

  const extraConds: SQL[] = []
  if (actionFilter) extraConds.push(eq(ticketActivityLog.action, actionFilter))

  if (searchRaw.length > 0) {
    const pattern = escapeIlikePattern(searchRaw)
    const searchParts: SQL[] = [
      ilike(tickets.title, pattern),
      ilike(users.fullName, pattern),
      ilike(users.email, pattern),
      sql`(${ticketActivityLog.metadata})::text ilike ${pattern}`,
    ]
    const idStr = searchRaw.startsWith('#') ? searchRaw.slice(1).trim() : searchRaw
    const idNum = parseInt(idStr, 10)
    if (!Number.isNaN(idNum) && idStr !== '' && String(idNum) === idStr) {
      searchParts.push(eq(tickets.id, idNum))
    }
    extraConds.push(or(...searchParts)!)
  }

  const accessAndExtras =
    extraConds.length > 0
      ? ticketFilter
        ? and(ticketFilter, ...extraConds)!
        : and(...extraConds)!
      : ticketFilter ?? undefined

  const listFiltered = accessAndExtras ? listBase.where(accessAndExtras) : listBase

  const rows = await listFiltered
    .orderBy(desc(ticketActivityLog.createdAt))
    .limit(limit)
    .offset(offset)

  const countBase = db
    .select({ total: count() })
    .from(ticketActivityLog)
    .innerJoin(tickets, eq(ticketActivityLog.ticketId, tickets.id))
    .leftJoin(users, eq(ticketActivityLog.actorUserId, users.id))

  const countFiltered = accessAndExtras ? countBase.where(accessAndExtras) : countBase

  const [countRow] = await countFiltered

  const total = Number(countRow?.total ?? 0)

  const data = rows.map((r) => ({
    id: r.id,
    ticket_id: r.ticket_id,
    ticket_title: r.ticket_title,
    action: r.action,
    actor_role: r.actor_role,
    metadata: r.metadata,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    actor:
      r.actor_name || r.actor_email || r.actor_avatar_url
        ? {
            name: r.actor_name ?? null,
            email: r.actor_email ?? null,
            avatar_url: r.actor_avatar_url ?? null,
          }
        : null,
  }))

  return NextResponse.json({ data, total })
}
