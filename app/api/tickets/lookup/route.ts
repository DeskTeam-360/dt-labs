import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { getCustomerCompanyIds } from '@/lib/customer-company'
import { db, teamMembers } from '@/lib/db'
import { getTicketsLookupCatalog } from '@/lib/tickets-lookup-catalog-cache'

/** GET /api/tickets/lookup - Lookup data for ticket form */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id!
    const role = (session.user as { role?: string }).role?.toLowerCase()

    const [catalog, userTeamRows, customerCompanyIds] = await Promise.all([
      getTicketsLookupCatalog(),
      role === 'customer'
        ? Promise.resolve([] as Array<{ teamId: string }>)
        : db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId)),
      role === 'customer' ? getCustomerCompanyIds(userId) : Promise.resolve([] as string[]),
    ])

    const userCompanyIds = customerCompanyIds
    const userCompanyId = userCompanyIds[0] ?? null
    const userTeamIds = userTeamRows.map((r) => r.teamId)
    const ticketTypesFiltered = catalog.ticketTypes
      .filter((t) => role !== 'customer' || !t.isAgentOnly)
      .map(({ id, title, slug, color }) => ({ id, title, slug, color }))
    // Admin sees all teams; non-admin sees public teams + teams they belong to
    const visibleTeams = role === 'admin'
      ? catalog.teams
      : catalog.teams.filter((t) => t.type === 'public' || userTeamIds.includes(t.id))

    const body = {
      userCompanyId,
      userCompanyIds,
      userTeamIds,
      teams: visibleTeams,
      users: catalog.users,
      ticketTypes: ticketTypesFiltered,
      ticketPriorities: catalog.ticketPriorities,
      companies:
        role === 'customer'
          ? catalog.companies.filter((c) => userCompanyIds.includes(c.id))
          : catalog.companies,
      tags: catalog.tags,
      statuses: catalog.statuses,
    }
    return NextResponse.json(body, {
      headers: {
        /** Lookup catalog rarely changes; browser may cache briefly. */
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
      },
    })
  } catch (err: unknown) {
    console.error('[API /api/tickets/lookup]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
