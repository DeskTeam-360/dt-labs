import { asc, eq, inArray, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { getApiUser, isTeamRole } from '@/lib/api-auth'
import { isAdmin } from '@/lib/auth-utils'
import { companies, db, skills, tags, teamMembers, teams, ticketStatuses, ticketTypes } from '@/lib/db'
import { isClosedLikeTicketStatus } from '@/lib/ticket-status-workflow'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/catalog - the names the other endpoints accept: statuses (slugs), ticket types, teams, tags and skills.
 * Add include=tags,skills,... to get only some; default is everything. Tags can belong to one company (company_id/company are then set).
 * Teams: admins see all; everybody else sees public teams and their own.
 * Auth: browser session or an API key with the `tickets:read` scope.
 */
export async function GET(request: Request) {
  const me = await getApiUser(request, 'tickets:read')
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isTeamRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const wanted = (new URL(request.url).searchParams.get('include') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const want = (k: string) => wanted.length === 0 || wanted.includes(k)
  const out: Record<string, unknown> = {}

  if (want('statuses')) {
    const rows = await db
      .select({ slug: ticketStatuses.slug, title: ticketStatuses.title, description: ticketStatuses.description, isActive: ticketStatuses.isActive })
      .from(ticketStatuses)
      .orderBy(asc(ticketStatuses.sortOrder), asc(ticketStatuses.id))
    out.statuses = rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      description: r.description || null,
      /** A switched-off status keeps its tickets but cannot be chosen any more. */
      active: r.isActive,
      /** Finished or parked: the ticket no longer counts as work in progress. */
      closed_like: isClosedLikeTicketStatus(r.slug),
    }))
  }

  if (want('types')) {
    const rows = await db
      .select({ id: ticketTypes.id, slug: ticketTypes.slug, title: ticketTypes.title, description: ticketTypes.description, agentOnly: ticketTypes.isAgentOnly, companyId: ticketTypes.companyId })
      .from(ticketTypes)
      .orderBy(asc(ticketTypes.sortOrder), asc(ticketTypes.id))
    out.types = rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title, description: r.description || null, agent_only: r.agentOnly, company_id: r.companyId ?? null }))
  }

  if (want('teams')) {
    const mine = isAdmin(me.role) ? [] : (await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, me.id))).map((r) => r.teamId)
    const where = isAdmin(me.role) ? undefined : mine.length ? or(eq(teams.type, 'public'), inArray(teams.id, mine)) : eq(teams.type, 'public')
    const rows = await db.select({ id: teams.id, name: teams.name, type: teams.type }).from(teams).where(where).orderBy(asc(teams.name))
    out.teams = rows.map((r) => ({ id: r.id, name: r.name, type: r.type ?? null }))
  }

  if (want('tags')) {
    const rows = await db
      .select({ name: tags.name, companyId: tags.companyId, companyName: companies.name })
      .from(tags)
      .leftJoin(companies, eq(tags.companyId, companies.id))
      .orderBy(asc(tags.name))
    out.tags = rows.map((r) => ({ name: r.name, company_id: r.companyId ?? null, company: r.companyName ?? null }))
  }

  if (want('skills')) {
    const rows = await db.select({ name: skills.name }).from(skills).orderBy(asc(skills.name))
    out.skills = rows.map((r) => ({ name: r.name }))
  }

  return NextResponse.json(out)
}
