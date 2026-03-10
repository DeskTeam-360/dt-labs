import { auth } from '@/auth'
import { db, users, teams, tickets } from '@/lib/db'
import { eq } from 'drizzle-orm'
import DashboardContent from '@/components/DashboardContent'

/** Session user shape for compatibility with components that expected Supabase User */
function toSessionUser(user: { id: string; email?: string | null; name?: string | null; image?: string | null }) {
  return {
    id: user.id,
    email: user.email ?? undefined,
    user_metadata: { full_name: user.name },
    ...user,
  }
}

export default async function DashboardPage() {
  const session = await auth()
  const user = session?.user

  if (!user) {
    return null // Middleware akan redirect ke login
  }

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
      user={toSessionUser(user) as any}
      stats={{
        totalUsers: usersCount,
        totalTeams: teamsCount,
        completedTickets: completedTicketsCount,
        totalTickets: totalTicketsCount,
      }}
    />
  )
}
