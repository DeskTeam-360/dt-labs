import { auth } from '@/auth'
import { db, users, teams, tickets } from '@/lib/db'
import { eq } from 'drizzle-orm'
import DashboardContent from '@/components/DashboardContent'

function toSessionUser(user: { id: string; email?: string | null; name?: string | null; image?: string | null }) {
  return {
    id: user.id,
    email: user.email ?? undefined,
    user_metadata: { full_name: user.name },
    ...user,
  }
}

export default async function AuthDashboardPage() {
  const session = await auth()
  const user = session?.user

  if (!user) {
    return null
  }

  let usersCount = 0
  let teamsCount = 0
  let completedTodosCount = 0
  let totalTodosCount = 0

  try {
    const [usersResult, teamsResult, completedResult, totalResult] = await Promise.all([
      db.select().from(users),
      db.select().from(teams),
      db.select().from(tickets).where(eq(tickets.status, 'completed')),
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
        completedTodos: completedTodosCount,
        totalTodos: totalTodosCount,
      }}
    />
  )
}
