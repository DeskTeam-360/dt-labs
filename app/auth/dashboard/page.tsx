import { inArray } from 'drizzle-orm'

import { auth } from '@/auth'
import CustomerDashboardContent from '@/components/content/CustomerDashboardContent'
import DashboardContent from '@/components/content/DashboardContent'
import { db, teams, tickets,users } from '@/lib/db'

function toSessionUser(user: { id: string; email?: string | null; name?: string | null; image?: string | null }) {
  return {
    ...user,
    email: user.email ?? undefined,
    user_metadata: { full_name: user.name },
  }
}

export default async function AuthDashboardPage() {
  const session = await auth()
  const user = session?.user

  if (!user) {
    return null
  }

  const role = (user as { role?: string }).role

  if (role === 'customer') {
    return (
      <CustomerDashboardContent
        user={toSessionUser(user) as any}
        withSidebar
      />
    )
  }

  let usersCount = 0
  let teamsCount = 0
  let completedTodosCount = 0
  let totalTodosCount = 0

  try {
    const [usersResult, teamsResult, completedResult, totalResult] = await Promise.all([
      db.select().from(users),
      db.select().from(teams),
      db
        .select()
        .from(tickets)
        .where(inArray(tickets.status, ['resolved', 'closed', 'completed'])),
      db.select().from(tickets),
    ])
    usersCount = usersResult.length
    teamsCount = teamsResult.length
    completedTodosCount = completedResult.length
    totalTodosCount = totalResult.length
  } catch (err) {
    console.error('Dashboard query failed. Run `npm run db:push` if tables do not exist:', err)
  }

  return (
    <DashboardContent
      user={toSessionUser(user) as any}
      stats={{
        totalUsers: usersCount,
        totalTeams: teamsCount,
        completedTickets: completedTodosCount,
        totalTickets: totalTodosCount,
      }}
    />
  )
}
