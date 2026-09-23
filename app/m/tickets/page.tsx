import { getMobileCompaniesAndTeams, getMobileSession, getMobileTickets } from '../_data'
import TicketsClient from './_TicketsClient'

export default async function MobileTickets() {
  const [user, tickets, catalog] = await Promise.all([
    getMobileSession(),
    getMobileTickets(),
    getMobileCompaniesAndTeams(),
  ])

  const isAgent = user?.role?.toLowerCase() !== 'customer'

  return (
    <TicketsClient
      tickets={(tickets ?? []) as Parameters<typeof TicketsClient>[0]['tickets']}
      isAgent={isAgent}
      companies={catalog.companies}
      teams={catalog.teams}
    />
  )
}
