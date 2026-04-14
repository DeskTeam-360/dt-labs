import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  teams,
  users,
  ticketTypes,
  ticketPriorities,
  companies,
  companyUsers,
  tags,
  ticketStatuses,
  teamMembers,
} from '@/lib/db'
import { asc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { ensureTicketStatusIsDeletableColumn } from '@/lib/ensure-ticket-status-is-deletable'

/** GET /api/tickets/lookup - Lookup data for ticket form */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureTicketStatusIsDeletableColumn()

    const userId = session.user.id!
    const role = (session.user as { role?: string }).role?.toLowerCase()
    const [teamsData, usersData, ticketTypesData, ticketPrioritiesData, companiesData, tagsData, statusesData, userTeamRows, userCompanyRow] =
    await Promise.all([
      db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(asc(teams.name)),
      db.select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role }).from(users).orderBy(asc(users.fullName)),
      db.select({ id: ticketTypes.id, title: ticketTypes.title, slug: ticketTypes.slug, color: ticketTypes.color }).from(ticketTypes).orderBy(asc(ticketTypes.sortOrder)),
      db.select({ id: ticketPriorities.id, title: ticketPriorities.title, slug: ticketPriorities.slug, color: ticketPriorities.color, sortOrder: ticketPriorities.sortOrder }).from(ticketPriorities).orderBy(asc(ticketPriorities.sortOrder)),
      db.select({ id: companies.id, name: companies.name, color: companies.color, email: companies.email }).from(companies).orderBy(asc(companies.name)),
      db.select({ id: tags.id, name: tags.name, slug: tags.slug, color: tags.color }).from(tags).orderBy(asc(tags.name)),
      db
        .select({
          id: ticketStatuses.id,
          slug: ticketStatuses.slug,
          title: ticketStatuses.title,
          customerTitle: ticketStatuses.customerTitle,
          color: ticketStatuses.color,
          showInKanban: ticketStatuses.showInKanban,
          sortOrder: ticketStatuses.sortOrder,
          isActive: ticketStatuses.isActive,
        })
        .from(ticketStatuses)
        .orderBy(asc(ticketStatuses.sortOrder)),
      role === 'customer'
        ? Promise.resolve([] as Array<{ teamId: string }>)
        : db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)),
      role === 'customer'
        ? Promise.all([
            db.select({ companyId: users.companyId }).from(users).where(eq(users.id, userId)).limit(1),
            db.select({ companyId: companyUsers.companyId }).from(companyUsers).where(eq(companyUsers.userId, userId)).limit(1),
          ]).then(([ur, cu]) => (ur[0]?.companyId ?? cu[0]?.companyId ?? null))
        : Promise.resolve(null as string | null),
    ])

  const userCompanyId = typeof userCompanyRow === 'string' ? userCompanyRow : null
  const userTeamIds = userTeamRows.map((r) => r.teamId)
  return NextResponse.json({
    userCompanyId,
    userTeamIds,
    teams: teamsData,
    users: usersData.map((u) => ({ id: u.id, full_name: u.fullName, email: u.email, role: u.role })),
    ticketTypes: ticketTypesData,
    ticketPriorities: ticketPrioritiesData,
    companies: companiesData,
    tags: tagsData,
    statuses: statusesData.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      customer_title: s.customerTitle ?? undefined,
      color: s.color,
      /** Nilai mentah dari DB; klien memakai isTicketStatusInKanban */
      show_in_kanban: s.showInKanban,
      sort_order: s.sortOrder,
      is_active: s.isActive,
    })),
  })
  } catch (err: any) {
    console.error('[API /api/tickets/lookup]', err)
    const msg = err?.message || String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
