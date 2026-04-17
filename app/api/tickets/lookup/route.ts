import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { companyUsers, db, teamMembers, users } from '@/lib/db'
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

    const [catalog, userTeamRows, userCompanyRow] = await Promise.all([
      getTicketsLookupCatalog(),
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
      teams: catalog.teams,
      users: catalog.users,
      ticketTypes: catalog.ticketTypes,
      ticketPriorities: catalog.ticketPriorities,
      companies: catalog.companies,
      tags: catalog.tags,
      statuses: catalog.statuses,
    })
  } catch (err: unknown) {
    console.error('[API /api/tickets/lookup]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
