import { auth } from '@/auth'
import { db, users, teams, tickets } from '@/lib/db'
import { eq } from 'drizzle-orm'
import DashboardContent from '@/components/DashboardContent'
import CustomerDashboardContent from '@/components/CustomerDashboardContent'

export default async function DashboardPage() {
  const session = await auth()
  const user = session?.user

  if (!user) {
    return null
  }

  const role = (user as { role?: string }).role

  // Customer: show customer dashboard (My Tickets, Priority, Time Spent, etc.) with sidebar
  if (role === 'customer') {
    return (
      <CustomerDashboardContent
        user={user}
        withSidebar
      />
    )
  }

  // Admin / other roles: show admin dashboard
  let usersCount = 0
  let teamsCount = 0
  let completedTicketsCount = 0
  let totalTicketsCount = 0

  try {
    const [usersResult, teamsResult, completedResult, totalResult] = await Promise.all([
      db.select().from(users),
      db.select().from(teams),
      db.select().from(tickets).where(eq(tickets.status, 'completed')),
      db.select().from(tickets),
    ])
    usersCount = usersResult.length
    teamsCount = teamsResult.length
    completedTicketsCount = completedResult.length
    totalTicketsCount = totalResult.length
  } catch (err) {
    console.error('Dashboard query failed. Run `npm run db:push` if tables do not exist:', err)
  }

  return (
    <DashboardContent
      user={user}
      stats={{
        totalUsers: usersCount,
        totalTeams: teamsCount,
        completedTickets: completedTicketsCount,
        totalTickets: totalTicketsCount,
      }}
    />
  )
}
